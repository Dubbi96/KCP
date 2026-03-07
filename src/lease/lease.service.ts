import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { LeaseEntity, LeaseStatus } from './lease.entity';
import { SlotService } from '../slot/slot.service';
import { DeviceService } from '../device/device.service';

const LOCK_LEASE_SWEEP = 100_004;

@Injectable()
export class LeaseService {
  private readonly logger = new Logger('LeaseService');
  private readonly defaultTtlSec: number;

  constructor(
    @InjectRepository(LeaseEntity)
    private readonly repo: Repository<LeaseEntity>,
    private readonly slotService: SlotService,
    private readonly deviceService: DeviceService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.defaultTtlSec = config.get<number>('LEASE_DEFAULT_TTL_SEC', 3600);
  }

  async acquireSlot(params: {
    platform: string;
    tenantId: string;
    userId?: string;
    runId?: string;
    scenarioRunId?: string;
    preferredNodeId?: string;
    ttlSec?: number;
  }) {
    const slot = await this.slotService.findAvailableSlot(
      params.platform,
      params.preferredNodeId,
    );
    if (!slot) throw new BadRequestException(`No available ${params.platform} slot`);

    await this.slotService.markSlotBusy(slot.id);

    const ttl = params.ttlSec || this.defaultTtlSec;
    const lease = this.repo.create({
      resourceType: 'slot',
      resourceId: slot.id,
      nodeId: slot.nodeId,
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.runId,
      scenarioRunId: params.scenarioRunId,
      status: 'active' as LeaseStatus,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });

    return { lease: await this.repo.save(lease), slot };
  }

  async acquireDevice(params: {
    platform: string;
    tenantId: string;
    userId?: string;
    deviceId?: string;
    ttlSec?: number;
  }) {
    let devices;
    if (params.deviceId) {
      const dev = await this.deviceService.findOne(params.deviceId);
      if (!dev || dev.status !== 'available')
        throw new BadRequestException('Device not available');
      devices = [dev];
    } else {
      devices = await this.deviceService.findAvailable(params.platform);
    }

    if (!devices.length)
      throw new BadRequestException(`No available ${params.platform} device`);

    const device = devices[0];
    await this.deviceService.setStatus(device.id, 'leased', params.tenantId);

    const ttl = params.ttlSec || this.defaultTtlSec;
    const lease = this.repo.create({
      resourceType: 'device',
      resourceId: device.id,
      nodeId: device.nodeId,
      tenantId: params.tenantId,
      userId: params.userId,
      status: 'active' as LeaseStatus,
      expiresAt: new Date(Date.now() + ttl * 1000),
    });

    return { lease: await this.repo.save(lease), device };
  }

  async release(leaseId: string) {
    const lease = await this.repo.findOne({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('Lease not found');
    if (lease.status === 'released') return lease;

    lease.status = 'released';
    lease.releasedAt = new Date();
    await this.repo.save(lease);

    if (lease.resourceType === 'slot') {
      await this.slotService.markSlotAvailable(lease.resourceId);
    } else if (lease.resourceType === 'device') {
      await this.deviceService.setStatus(lease.resourceId, 'available', undefined);
    }

    return lease;
  }

  async renew(leaseId: string, ttlSec?: number) {
    const lease = await this.repo.findOne({ where: { id: leaseId } });
    if (!lease || lease.status !== 'active')
      throw new BadRequestException('Lease not active');

    lease.expiresAt = new Date(Date.now() + (ttlSec || this.defaultTtlSec) * 1000);
    return this.repo.save(lease);
  }

  async findActive(filters?: { tenantId?: string; nodeId?: string; resourceType?: string }) {
    const qb = this.repo.createQueryBuilder('l')
      .where('l.status = :s', { s: 'active' });
    if (filters?.tenantId) qb.andWhere('l.tenantId = :t', { t: filters.tenantId });
    if (filters?.nodeId) qb.andWhere('l.nodeId = :n', { n: filters.nodeId });
    if (filters?.resourceType) qb.andWhere('l.resourceType = :rt', { rt: filters.resourceType });
    return qb.orderBy('l.createdAt', 'DESC').getMany();
  }

  @Interval(30_000)
  async sweepExpiredLeases() {
    // Leader election: only one KCP instance runs the sweep
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const [result] = await qr.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [LOCK_LEASE_SWEEP],
      );
      if (!result.acquired) return;

      try {
        const expired = await this.repo
          .createQueryBuilder('l')
          .where('l.status = :s', { s: 'active' })
          .andWhere('l.expiresAt < :now', { now: new Date() })
          .getMany();

        for (const lease of expired) {
          this.logger.log(`Lease ${lease.id} expired — releasing ${lease.resourceType} ${lease.resourceId}`);
          lease.status = 'expired';
          lease.releasedAt = new Date();
          await this.repo.save(lease);

          if (lease.resourceType === 'slot') {
            await this.slotService.markSlotAvailable(lease.resourceId);
          } else if (lease.resourceType === 'device') {
            await this.deviceService.setStatus(lease.resourceId, 'available', undefined);
          }
        }
      } finally {
        await qr.query('SELECT pg_advisory_unlock($1)', [LOCK_LEASE_SWEEP]);
      }
    } finally {
      await qr.release();
    }
  }
}
