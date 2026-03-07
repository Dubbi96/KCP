import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { NodeService } from '../node/node.service';
import { JobEntity, JobStatus } from '../job/job.entity';
import { SlotService } from '../slot/slot.service';
import { DeviceService } from '../device/device.service';
import { LeaseEntity } from '../lease/lease.entity';

// Advisory lock IDs for leader election (prevents duplicate execution across replicas)
const LOCK_NODE_HEALTH = 100_001;
const LOCK_JOB_TIMEOUTS = 100_002;
const LOCK_DRAIN_CHECK = 100_003;

@Injectable()
export class HealthService {
  private readonly logger = new Logger('HealthService');
  private readonly timeoutSec: number;
  private readonly assignedTimeoutSec = 120;
  private readonly runningTimeoutSec = 900;

  constructor(
    private readonly nodeService: NodeService,
    private readonly slotService: SlotService,
    private readonly deviceService: DeviceService,
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
    @InjectRepository(LeaseEntity)
    private readonly leaseRepo: Repository<LeaseEntity>,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.timeoutSec = config.get<number>('NODE_HEARTBEAT_TIMEOUT_SEC', 90);
  }

  /**
   * Postgres advisory lock wrapper for leader election.
   * Only one KCP instance runs each scheduled task at a time.
   * Uses a dedicated QueryRunner so lock/unlock use the same connection.
   */
  private async withLeaderLock(lockId: number, fn: () => Promise<void>) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const [result] = await qr.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId],
      );
      if (!result.acquired) return;
      try {
        await fn();
      } finally {
        await qr.query('SELECT pg_advisory_unlock($1)', [lockId]);
      }
    } finally {
      await qr.release();
    }
  }

  // --- Stale node detection + offline reconciliation (15s) ---
  @Interval(15_000)
  async checkNodeHealth() {
    await this.withLeaderLock(LOCK_NODE_HEALTH, async () => {
      const staleNodeIds = await this.nodeService.markStaleNodesOffline(this.timeoutSec);
      for (const nodeId of staleNodeIds) {
        await this.reconcileOfflineNode(nodeId);
      }
    });
  }

  // --- Job timeout detection (30s) ---
  @Interval(30_000)
  async checkJobTimeouts() {
    await this.withLeaderLock(LOCK_JOB_TIMEOUTS, async () => {
      await this.reapStuckAssignedJobs();
      await this.reapStuckRunningJobs();
    });
  }

  // --- Drain completion check (15s) ---
  @Interval(15_000)
  async checkDrainCompletion() {
    await this.withLeaderLock(LOCK_DRAIN_CHECK, async () => {
      const drainingNodes = await this.nodeService.findDrainingNodes();
      for (const node of drainingNodes) {
        const activeJobs = await this.jobRepo.find({
          where: {
            assignedNodeId: node.id,
            status: In(['assigned', 'running'] as JobStatus[]),
          },
        });

        // Also check active leases on this node
        const activeLeases = await this.leaseRepo.find({
          where: { nodeId: node.id, status: 'active' as any },
        });

        if (activeJobs.length === 0 && activeLeases.length === 0) {
          this.logger.log(
            `Node ${node.name} drain complete (0 active jobs, 0 active leases) — transitioning to offline`,
          );
          await this.nodeService.setStatus(node.id, 'offline');
        } else {
          this.logger.debug(
            `Node ${node.name} draining: ${activeJobs.length} jobs, ${activeLeases.length} leases remaining`,
          );
        }
      }
    });
  }

  /**
   * When a node goes offline unexpectedly, clean up all its assigned resources.
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
          priority: job.priority + 1,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          status: 'pending' as JobStatus,
        });
        await this.jobRepo.save(retry);
        this.logger.log(`Job ${job.id} re-queued (attempt ${job.attempt + 1}/${job.maxAttempts}) due to node offline`);
      } else {
        job.status = 'failed';
        job.result = { ...job.result, infraFailure: true, error: 'Node went offline during execution' };
        job.completedAt = new Date();
        await this.jobRepo.save(job);
        this.logger.warn(`Job ${job.id} marked failed — node offline, max retries exhausted`);
      }

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
      if (job.assignedSlotId) await this.slotService.markSlotAvailable(job.assignedSlotId).catch(() => {});
      if (job.assignedDeviceId) await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined).catch(() => {});

      job.status = 'pending';
      job.assignedNodeId = undefined;
      job.assignedSlotId = undefined;
      job.assignedDeviceId = undefined;
      await this.jobRepo.save(job);
    }
  }

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
