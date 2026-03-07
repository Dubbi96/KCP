import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { JobEntity, JobStatus } from './job.entity';
import { NodeService } from '../node/node.service';
import { SlotService } from '../slot/slot.service';
import { DeviceService } from '../device/device.service';
import { LeaseService } from '../lease/lease.service';

@Injectable()
export class JobService {
  private readonly logger = new Logger('JobService');

  constructor(
    @InjectRepository(JobEntity)
    private readonly repo: Repository<JobEntity>,
    private readonly dataSource: DataSource,
    private readonly nodeService: NodeService,
    private readonly slotService: SlotService,
    private readonly deviceService: DeviceService,
    private readonly leaseService: LeaseService,
  ) {}

  async create(params: {
    tenantId: string;
    runId?: string;
    scenarioRunId?: string;
    scenarioId?: string;
    platform: string;
    payload?: Record<string, any>;
    requiredLabels?: string[];
    requiredDeviceId?: string;
    priority?: number;
  }) {
    const job = this.repo.create({
      tenantId: params.tenantId,
      runId: params.runId,
      scenarioRunId: params.scenarioRunId,
      scenarioId: params.scenarioId,
      platform: params.platform,
      payload: params.payload || {},
      requiredLabels: params.requiredLabels || [],
      requiredDeviceId: params.requiredDeviceId,
      priority: params.priority || 0,
      status: 'pending' as JobStatus,
    });
    return this.repo.save(job);
  }

  /**
   * Atomic job claim using FOR UPDATE SKIP LOCKED.
   * Scans up to 10 candidates to avoid starvation when the first job
   * doesn't match the requesting node's capabilities.
   */
  async claim(nodeId: string, platforms: string[]) {
    const node = await this.nodeService.findOne(nodeId);
    if (node.status !== 'online')
      throw new BadRequestException(`Node is ${node.status} — cannot claim jobs`);

    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(JobEntity);

      // pessimistic_partial_write = FOR UPDATE SKIP LOCKED in PostgreSQL
      // This prevents race conditions: concurrent nodes each get different rows
      const candidates = await jobRepo
        .createQueryBuilder('j')
        .where('j.status = :status', { status: 'pending' })
        .andWhere('j.platform IN (:...platforms)', { platforms })
        .orderBy('j.priority', 'DESC')
        .addOrderBy('j.createdAt', 'ASC')
        .limit(10)
        .setLock('pessimistic_partial_write')
        .getMany();

      if (!candidates.length) return null;

      for (const job of candidates) {
        // Label check
        if (job.requiredLabels?.length) {
          if (!job.requiredLabels.every((l) => node.labels.includes(l))) continue;
        }

        // Device check for mobile
        if (job.platform !== 'web') {
          if (job.requiredDeviceId) {
            const dev = await this.deviceService.findOne(job.requiredDeviceId);
            if (!dev || dev.nodeId !== nodeId || dev.status !== 'available') continue;
          } else {
            const avail = await this.deviceService.findAvailable(job.platform, nodeId);
            if (!avail.length) continue;
          }
        }

        // Slot check
        const slot = await this.slotService.findAvailableSlot(job.platform, nodeId);
        if (!slot) continue;

        // Assign the job atomically within the transaction
        job.status = 'assigned';
        job.assignedNodeId = nodeId;
        job.assignedSlotId = slot.id;
        job.attempt++;
        await jobRepo.save(job);

        await this.slotService.markSlotBusy(slot.id);

        // Reserve device if mobile
        if (job.platform !== 'web') {
          const devices = job.requiredDeviceId
            ? [await this.deviceService.findOne(job.requiredDeviceId)]
            : await this.deviceService.findAvailable(job.platform, nodeId);
          if (devices[0]) {
            job.assignedDeviceId = devices[0].id;
            await this.deviceService.setStatus(devices[0].id, 'leased', job.tenantId);
            await jobRepo.save(job);
          }
        }

        this.logger.log(
          `Job ${job.id} claimed by node ${node.name} (slot=${slot.id}, attempt=${job.attempt})`,
        );
        return job;
      }

      return null;
    });
  }

  async reportStarted(jobId: string, requestingNodeId?: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    // Verify the requesting node is the assigned node
    if (requestingNodeId && job.assignedNodeId && job.assignedNodeId !== requestingNodeId) {
      throw new BadRequestException('Node is not assigned to this job');
    }

    job.status = 'running';
    job.startedAt = new Date();
    return this.repo.save(job);
  }

  async reportCompleted(jobId: string, result: Record<string, any>, requestingNodeId?: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    // Verify the requesting node is the assigned node
    if (requestingNodeId && job.assignedNodeId && job.assignedNodeId !== requestingNodeId) {
      throw new BadRequestException('Node is not assigned to this job');
    }

    // Idempotent: ignore duplicate completion callbacks
    if (['completed', 'failed', 'cancelled', 'retry_pending'].includes(job.status)) {
      return job;
    }

    job.status = result.passed ? 'completed' : 'failed';
    job.result = result;
    job.completedAt = new Date();
    await this.repo.save(job);

    // Release slot
    if (job.assignedSlotId) {
      await this.slotService.markSlotAvailable(job.assignedSlotId);
    }
    // Release device
    if (job.assignedDeviceId) {
      await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined);
    }

    // If failed and retryable, re-queue
    if (!result.passed && result.infraFailure && job.attempt < job.maxAttempts) {
      job.status = 'retry_pending';
      job.assignedNodeId = undefined;
      job.assignedSlotId = undefined;
      job.assignedDeviceId = undefined;
      await this.repo.save(job);

      const retry = this.repo.create({
        tenantId: job.tenantId,
        runId: job.runId,
        scenarioRunId: job.scenarioRunId,
        scenarioId: job.scenarioId,
        platform: job.platform,
        requiredLabels: job.requiredLabels,
        requiredDeviceId: job.requiredDeviceId,
        payload: job.payload,
        priority: job.priority,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        status: 'pending' as JobStatus,
      });
      await this.repo.save(retry);
    }

    return job;
  }

  async cancel(jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (['completed', 'failed', 'cancelled'].includes(job.status))
      throw new BadRequestException('Job already finished');

    job.status = 'cancelled';
    job.completedAt = new Date();
    await this.repo.save(job);

    if (job.assignedSlotId) await this.slotService.markSlotAvailable(job.assignedSlotId);
    if (job.assignedDeviceId) await this.deviceService.setStatus(job.assignedDeviceId, 'available', undefined);

    return job;
  }

  async findByRun(runId: string) {
    return this.repo.find({ where: { runId }, order: { createdAt: 'ASC' } });
  }

  async findPending(platform?: string) {
    const qb = this.repo.createQueryBuilder('j')
      .where('j.status IN (:...statuses)', { statuses: ['pending', 'assigned'] });
    if (platform) qb.andWhere('j.platform = :p', { p: platform });
    return qb.orderBy('j.priority', 'DESC').addOrderBy('j.createdAt', 'ASC').getMany();
  }

  async getStats() {
    const all = await this.repo.find();
    const stats: Record<string, Record<string, number>> = {};
    for (const j of all) {
      if (!stats[j.platform]) stats[j.platform] = {};
      stats[j.platform][j.status] = (stats[j.platform][j.status] || 0) + 1;
    }
    return stats;
  }

  async findNodeActiveJobs(nodeId: string) {
    return this.repo.find({
      where: {
        assignedNodeId: nodeId,
        status: In(['assigned', 'running']),
      },
    });
  }
}
