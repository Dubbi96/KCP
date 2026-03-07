import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceEntity, DeviceStatus } from './device.entity';

@Injectable()
export class DeviceService {
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
      .andWhere('d.status = :status', { status: 'available' });
    if (nodeId) qb.andWhere('d.nodeId = :nodeId', { nodeId });
    return qb.getMany();
  }

  async setStatus(id: string, status: DeviceStatus, tenantId?: string) {
    const update: any = { status };
    if (tenantId !== undefined) update.tenantId = tenantId;
    await this.repo.update(id, update);
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
