import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JobEntity, JobStatus } from './job.entity';
import { NodeService } from '../node/node.service';
import { SlotService } from '../slot/slot.service';
import { DeviceService } from '../device/device.service';
import { LeaseService } from '../lease/lease.service';

@Injectable()
export class JobService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly repo: Repository<JobEntity>,
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

  async claim(nodeId: string, platforms: string[]) {
    const node = await this.nodeService.findOne(nodeId);
    if (node.status !== 'online')
      throw new BadRequestException('Node is not online');

    const job = await this.repo
      .createQueryBuilder('j')
      .where('j.status = :status', { status: 'pending' })
      .andWhere('j.platform IN (:...platforms)', { platforms })
      .orderBy('j.priority', 'DESC')
      .addOrderBy('j.createdAt', 'ASC')
      .getOne();

    if (!job) return null;

    // Check if node can handle this job
    if (job.requiredLabels?.length) {
      const hasLabels = job.requiredLabels.every((l) => node.labels.includes(l));
      if (!hasLabels) return null;
    }

    // For mobile jobs, check device availability on this node
    if (job.platform !== 'web') {
      if (job.requiredDeviceId) {
        const dev = await this.deviceService.findOne(job.requiredDeviceId);
        if (!dev || dev.nodeId !== nodeId || dev.status !== 'available') return null;
      } else {
        const avail = await this.deviceService.findAvailable(job.platform, nodeId);
        if (!avail.length) return null;
      }
    }

    // Check slot availability
    const slot = await this.slotService.findAvailableSlot(job.platform, nodeId);
    if (!slot) return null;

    // Assign the job
    job.status = 'assigned';
    job.assignedNodeId = nodeId;
    job.assignedSlotId = slot.id;
    job.attempt++;
    await this.repo.save(job);

    await this.slotService.markSlotBusy(slot.id);

    // If mobile, also reserve a device
    if (job.platform !== 'web') {
      const devices = job.requiredDeviceId
        ? [await this.deviceService.findOne(job.requiredDeviceId)]
        : await this.deviceService.findAvailable(job.platform, nodeId);
      if (devices[0]) {
        job.assignedDeviceId = devices[0].id;
        await this.deviceService.setStatus(devices[0].id, 'leased', job.tenantId);
        await this.repo.save(job);
      }
    }

    return job;
  }

  async reportStarted(jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    job.status = 'running';
    job.startedAt = new Date();
    return this.repo.save(job);
  }

  async reportCompleted(jobId: string, result: Record<string, any>) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

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

      // Create retry as new pending
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
