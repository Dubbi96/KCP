import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { NodeService } from '../node/node.service';
import { JobEntity, JobStatus } from '../job/job.entity';
import { SlotService } from '../slot/slot.service';
import { DeviceService } from '../device/device.service';
import { LeaseEntity } from '../lease/lease.entity';

/**
 * Central health daemon:
 * - Detects stale nodes (heartbeat timeout)
 * - Reconciles resources when node goes offline (jobs, leases, devices, slots)
 * - Detects stuck jobs (assigned but not started, running too long)
 * - Completes drain when all jobs finish on a draining node
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger('HealthService');
  private readonly timeoutSec: number;
  private readonly assignedTimeoutSec = 120;  // 2 min to start after assigned
  private readonly runningTimeoutSec = 900;   // 15 min max running time

  constructor(
    private readonly nodeService: NodeService,
    private readonly slotService: SlotService,
    private readonly deviceService: DeviceService,
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
    @InjectRepository(LeaseEntity)
    private readonly leaseRepo: Repository<LeaseEntity>,
    config: ConfigService,
  ) {
    this.timeoutSec = config.get<number>('NODE_HEARTBEAT_TIMEOUT_SEC', 90);
  }

  // --- Stale node detection + offline reconciliation (15s) ---
  @Interval(15_000)
  async checkNodeHealth() {
    const staleNodeIds = await this.nodeService.markStaleNodesOffline(this.timeoutSec);
    for (const nodeId of staleNodeIds) {
      await this.reconcileOfflineNode(nodeId);
    }
  }

  // --- Job timeout detection (30s) ---
  @Interval(30_000)
  async checkJobTimeouts() {
    await this.reapStuckAssignedJobs();
    await this.reapStuckRunningJobs();
  }

  // --- Drain completion check (15s) ---
  @Interval(15_000)
  async checkDrainCompletion() {
    const drainingNodes = await this.nodeService.findDrainingNodes();
    for (const node of drainingNodes) {
      const activeJobs = await this.jobRepo.find({
        where: {
          assignedNodeId: node.id,
          status: In(['assigned', 'running'] as JobStatus[]),
        },
      });
      if (activeJobs.length === 0) {
        this.logger.log(`Node ${node.name} drain complete — transitioning to offline`);
        await this.nodeService.setStatus(node.id, 'offline');
      }
    }
  }

  /**
   * When a node goes offline unexpectedly, clean up all its assigned resources:
   * - In-flight jobs → infra_failed or re-queued
   * - Active leases → force-expired
   * - Slots/devices already handled by setStatus('offline')
   */
  private async reconcileOfflineNode(nodeId: string) {
    this.logger.warn(`Reconciling offline node ${nodeId}`);

    // 1) Handle in-flight jobs
    const activeJobs = await this.jobRepo.find({
      where: {
        assignedNodeId: nodeId,
        status: In(['assigned', 'running'] as JobStatus[]),
      },
    });

    for (const job of activeJobs) {
      if (job.attempt < job.maxAttempts) {
        // Re-queue for retry on another node
        job.status = 'retry_pending';
        job.result = { ...job.result, nodeOffline: true };
        job.completedAt = new Date();
        await this.jobRepo.save(job);

        const retry = this.jobRepo.create({
          tenantId: job.tenantId,
          runId: job.runId,
          scenarioRunId: job.scenarioRunId,
          scenarioId: job.scenarioId,
          platform: job.platform,
          requiredLabels: job.requiredLabels,
          requiredDeviceId: job.requiredDeviceId,
          payload: job.payload,
          priority: job.priority + 1, // bump priority for retries
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          status: 'pending' as JobStatus,
        });
        await this.jobRepo.save(retry);
        this.logger.log(`Job ${job.id} re-queued (attempt ${job.attempt + 1}/${job.maxAttempts}) due to node offline`);
      } else {
        // Max retries exceeded — mark infra_failed
        job.status = 'failed';
        job.result = { ...job.result, infraFailure: true, error: 'Node went offline during execution' };
        job.completedAt = new Date();
        await this.jobRepo.save(job);
        this.logger.warn(`Job ${job.id} marked failed — node offline, max retries exhausted`);
      }

      // Release slot/device
      if (job.assignedSlotId) await this.slotService.markSlotAvailable(job.assignedSlotId).catch(() => {});
      if (job.assignedDeviceId) await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined).catch(() => {});
    }

    // 2) Force-expire active leases on this node
    const activeLeases = await this.leaseRepo.find({
      where: { nodeId, status: 'active' as any },
    });
    for (const lease of activeLeases) {
      lease.status = 'expired' as any;
      lease.releasedAt = new Date();
      await this.leaseRepo.save(lease);
      this.logger.log(`Lease ${lease.id} force-expired (node offline)`);
    }
  }

  /**
   * Jobs stuck in 'assigned' too long (node claimed but never started).
   * Re-queue them for another node.
   */
  private async reapStuckAssignedJobs() {
    const cutoff = new Date(Date.now() - this.assignedTimeoutSec * 1000);
    const stuck = await this.jobRepo.find({
      where: {
        status: 'assigned' as JobStatus,
        updatedAt: LessThan(cutoff),
      },
    });

    for (const job of stuck) {
      this.logger.warn(`Job ${job.id} stuck in 'assigned' for ${this.assignedTimeoutSec}s — re-queuing`);
      // Release resources
      if (job.assignedSlotId) await this.slotService.markSlotAvailable(job.assignedSlotId).catch(() => {});
      if (job.assignedDeviceId) await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined).catch(() => {});

      job.status = 'pending';
      job.assignedNodeId = undefined;
      job.assignedSlotId = undefined;
      job.assignedDeviceId = undefined;
      await this.jobRepo.save(job);
    }
  }

  /**
   * Jobs stuck in 'running' too long (execution timeout).
   * Mark as infra_failed and release resources.
   */
  private async reapStuckRunningJobs() {
    const cutoff = new Date(Date.now() - this.runningTimeoutSec * 1000);
    const stuck = await this.jobRepo.find({
      where: {
        status: 'running' as JobStatus,
        startedAt: LessThan(cutoff),
      },
    });

    for (const job of stuck) {
      this.logger.warn(`Job ${job.id} running for >${this.runningTimeoutSec}s — marking failed`);
      if (job.assignedSlotId) await this.slotService.markSlotAvailable(job.assignedSlotId).catch(() => {});
      if (job.assignedDeviceId) await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined).catch(() => {});

      job.status = 'failed';
      job.result = { infraFailure: true, error: `Execution timeout (${this.runningTimeoutSec}s)` };
      job.completedAt = new Date();
      await this.jobRepo.save(job);
    }
  }
}
