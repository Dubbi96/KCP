import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceEntity, DeviceStatus, DeviceHealthStatus } from './device.entity';

const AUTO_QUARANTINE_THRESHOLD = 5;
const DEFAULT_QUARANTINE_MINUTES = 30;

@Injectable()
export class DeviceService {
  private readonly logger = new Logger('DeviceService');

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly repo: Repository<DeviceEntity>,
  ) {}

  async syncFromHeartbeat(nodeId: string, reported: any[]) {
    const existing = await this.repo.find({ where: { nodeId } });
    const existingByUdid = new Map(existing.map((d) => [d.deviceUdid, d]));
    const reportedUdids = new Set<string>();

    for (const dev of reported) {
      reportedUdids.add(dev.id || dev.deviceUdid);
      const udid = dev.id || dev.deviceUdid;
      const found = existingByUdid.get(udid);

      if (found) {
        found.name = dev.name || found.name;
        found.model = dev.model || found.model;
        found.osVersion = dev.version || dev.osVersion;
        found.lastSeenAt = new Date();
        if (found.status === 'offline') found.status = 'available';
        await this.repo.save(found);
      } else {
        await this.repo.save(
          this.repo.create({
            nodeId,
            platform: dev.platform,
            deviceUdid: udid,
            name: dev.name || udid,
            model: dev.model,
            osVersion: dev.version,
            status: 'available' as DeviceStatus,
            healthStatus: 'unknown' as DeviceHealthStatus,
            lastSeenAt: new Date(),
          }),
        );
      }
    }

    for (const dev of existing) {
      if (!reportedUdids.has(dev.deviceUdid) && dev.status !== 'leased') {
        dev.status = 'offline';
        await this.repo.save(dev);
      }
    }
  }

  /**
   * Update device health from heartbeat deviceHealth payload.
   */
  async syncHealthFromHeartbeat(nodeId: string, deviceHealth: Record<string, any>) {
    if (!deviceHealth || typeof deviceHealth !== 'object') return;

    for (const [deviceId, snapshot] of Object.entries(deviceHealth)) {
      const device = await this.repo.findOne({
        where: [
          { nodeId, deviceUdid: deviceId },
          { nodeId, id: deviceId },
        ],
      });

      if (!device) continue;

      device.healthStatus = (snapshot.healthStatus || 'unknown') as DeviceHealthStatus;
      device.lastHealthCheckAt = new Date();

      if (snapshot.lastFailureCode) {
        device.lastFailureCode = snapshot.lastFailureCode;
      }

      await this.repo.save(device);
    }
  }

  async findAll(filters?: { platform?: string; status?: string; nodeId?: string }) {
    const qb = this.repo.createQueryBuilder('d');
    if (filters?.platform) qb.andWhere('d.platform = :p', { p: filters.platform });
    if (filters?.status) qb.andWhere('d.status = :s', { s: filters.status });
    if (filters?.nodeId) qb.andWhere('d.nodeId = :n', { n: filters.nodeId });
    return qb.orderBy('d.createdAt', 'DESC').getMany();
  }

  async findAvailable(platform: string, nodeId?: string): Promise<DeviceEntity[]> {
    const qb = this.repo.createQueryBuilder('d')
      .where('d.platform = :platform', { platform })
      .andWhere('d.status = :status', { status: 'available' })
      .andWhere('(d.quarantineUntil IS NULL OR d.quarantineUntil < :now)', { now: new Date() });
    if (nodeId) qb.andWhere('d.nodeId = :nodeId', { nodeId });
    return qb.getMany();
  }

  async setStatus(id: string, status: DeviceStatus, tenantId?: string) {
    const update: any = { status };
    if (tenantId !== undefined) update.tenantId = tenantId;
    await this.repo.update(id, update);
  }

  // ─── Health / Quarantine ──────────────────────────────

  async updateHealth(deviceId: string, payload: {
    healthStatus: string;
    lastFailureCode?: string;
    failureCount?: number;
    consecutiveFailures?: number;
    lastRecoveryAction?: string;
  }) {
    const device = await this.repo.findOne({ where: { id: deviceId } });
    if (!device) return;

    device.healthStatus = (payload.healthStatus || 'unknown') as DeviceHealthStatus;
    device.lastHealthCheckAt = new Date();

    if (payload.lastFailureCode) {
      device.lastFailureCode = payload.lastFailureCode;
    }
    if (payload.failureCount !== undefined) {
      device.failureCount = payload.failureCount;
    }
    if (payload.consecutiveFailures !== undefined) {
      device.consecutiveFailures = payload.consecutiveFailures;
    }
    if (payload.lastRecoveryAction) {
      device.lastRecoveryAction = payload.lastRecoveryAction;
    }

    await this.repo.save(device);
  }

  async quarantine(deviceId: string, durationMinutes?: number, reason?: string) {
    const duration = durationMinutes || DEFAULT_QUARANTINE_MINUTES;
    const until = new Date(Date.now() + duration * 60_000);

    await this.repo.update(deviceId, {
      healthStatus: 'quarantined' as DeviceHealthStatus,
      quarantineUntil: until,
      lastFailureCode: reason || undefined,
    });

    this.logger.warn(`Device ${deviceId} quarantined until ${until.toISOString()} (reason: ${reason || 'manual'})`);
  }

  async unquarantine(deviceId: string) {
    await this.repo.update(deviceId, {
      healthStatus: 'unknown' as DeviceHealthStatus,
      quarantineUntil: null as any,
      consecutiveFailures: 0,
    });
    this.logger.log(`Device ${deviceId} removed from quarantine`);
  }

  /**
   * Auto-quarantine device if consecutive failures exceed threshold.
   */
  async recordFailure(deviceId: string, failureCode: string): Promise<boolean> {
    const device = await this.repo.findOne({ where: { id: deviceId } });
    if (!device) return false;

    device.failureCount += 1;
    device.consecutiveFailures += 1;
    device.lastFailureCode = failureCode;
    await this.repo.save(device);

    if (device.consecutiveFailures >= AUTO_QUARANTINE_THRESHOLD) {
      await this.quarantine(deviceId, DEFAULT_QUARANTINE_MINUTES, `auto: ${failureCode} x${device.consecutiveFailures}`);
      return true; // quarantined
    }

    return false;
  }

  /**
   * Record a successful operation — resets consecutive failures.
   */
  async recordSuccess(deviceId: string) {
    await this.repo.update(deviceId, {
      consecutiveFailures: 0,
      healthStatus: 'healthy' as DeviceHealthStatus,
      lastHealthCheckAt: new Date(),
    });
  }

  /**
   * Clear expired quarantines (called by HealthService periodically).
   */
  async clearExpiredQuarantines(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(DeviceEntity)
      .set({
        healthStatus: 'unknown' as DeviceHealthStatus,
        quarantineUntil: null as any,
      })
      .where('quarantineUntil IS NOT NULL')
      .andWhere('quarantineUntil < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  async markNodeDevicesOffline(nodeId: string) {
    await this.repo
      .createQueryBuilder()
      .update(DeviceEntity)
      .set({ status: 'offline' as DeviceStatus })
      .where('nodeId = :nodeId', { nodeId })
      .andWhere('status != :leased', { leased: 'leased' })
      .execute();
  }

  async removeNodeDevices(nodeId: string) {
    await this.repo.delete({ nodeId });
  }

  async findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }
}
