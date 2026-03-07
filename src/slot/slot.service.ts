import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlotEntity, SlotStatus, SlotEngine, SlotPlatform } from './slot.entity';

const PLATFORM_ENGINE_MAP: Record<string, { platform: SlotPlatform; engine: SlotEngine }> = {
  web: { platform: 'web', engine: 'playwright' },
  ios: { platform: 'ios', engine: 'appium-ios' },
  android: { platform: 'android', engine: 'appium-android' },
};

const DEFAULT_SLOT_COUNTS: Record<string, number> = {
  web: 6,
  ios: 2,
  android: 2,
};

@Injectable()
export class SlotService {
  constructor(
    @InjectRepository(SlotEntity)
    private readonly repo: Repository<SlotEntity>,
  ) {}

  async syncSlotsForNode(nodeId: string, platforms: string[]) {
    const existing = await this.repo.find({ where: { nodeId } });
    const existingByPlatform = new Map<string, SlotEntity[]>();
    for (const s of existing) {
      const arr = existingByPlatform.get(s.platform) || [];
      arr.push(s);
      existingByPlatform.set(s.platform, arr);
    }

    for (const p of platforms) {
      const mapping = PLATFORM_ENGINE_MAP[p];
      if (!mapping) continue;

      const current = existingByPlatform.get(mapping.platform) || [];
      const target = DEFAULT_SLOT_COUNTS[p] || 2;

      if (current.length < target) {
        const toCreate = target - current.length;
        for (let i = 0; i < toCreate; i++) {
          await this.repo.save(
            this.repo.create({
              nodeId,
              platform: mapping.platform,
              engine: mapping.engine,
              status: 'available' as SlotStatus,
            }),
          );
        }
      }
    }
  }

  async updateSlotStatus(nodeId: string, slots: Record<string, any>) {
    for (const [platform, info] of Object.entries(slots)) {
      if (typeof info === 'object' && info.busy !== undefined) {
        const all = await this.repo.find({
          where: { nodeId, platform: platform as SlotPlatform },
          order: { createdAt: 'ASC' },
        });

        let busyCount = info.busy || 0;
        for (const slot of all) {
          if (busyCount > 0) {
            slot.status = 'busy';
            busyCount--;
          } else {
            slot.status = 'available';
          }
          await this.repo.save(slot);
        }
      }
    }
  }

  async findAvailableSlot(platform: string, nodeId?: string): Promise<SlotEntity | null> {
    const qb = this.repo.createQueryBuilder('s')
      .where('s.platform = :platform', { platform })
      .andWhere('s.status = :status', { status: 'available' });
    if (nodeId) qb.andWhere('s.nodeId = :nodeId', { nodeId });
    qb.orderBy('s.createdAt', 'ASC');
    return qb.getOne();
  }

  async countByNode(nodeId: string): Promise<Record<string, { total: number; available: number; busy: number }>> {
    const slots = await this.repo.find({ where: { nodeId } });
    const result: Record<string, { total: number; available: number; busy: number }> = {};
    for (const s of slots) {
      if (!result[s.platform]) result[s.platform] = { total: 0, available: 0, busy: 0 };
      result[s.platform].total++;
      if (s.status === 'available') result[s.platform].available++;
      if (s.status === 'busy') result[s.platform].busy++;
    }
    return result;
  }

  async markSlotBusy(id: string) {
    await this.repo.update(id, { status: 'busy' as SlotStatus });
  }

  async markSlotAvailable(id: string) {
    await this.repo.update(id, { status: 'available' as SlotStatus });
  }

  async markNodeSlotsOffline(nodeId: string) {
    await this.repo
      .createQueryBuilder()
      .update(SlotEntity)
      .set({ status: 'offline' as SlotStatus })
      .where('nodeId = :nodeId', { nodeId })
      .execute();
  }

  async removeNodeSlots(nodeId: string) {
    await this.repo.delete({ nodeId });
  }

  async getPoolSummary(): Promise<Record<string, { total: number; available: number; busy: number; offline: number }>> {
    const all = await this.repo.find();
    const result: Record<string, { total: number; available: number; busy: number; offline: number }> = {};
    for (const s of all) {
      if (!result[s.platform]) result[s.platform] = { total: 0, available: 0, busy: 0, offline: 0 };
      result[s.platform].total++;
      if (s.status === 'available') result[s.platform].available++;
      else if (s.status === 'busy') result[s.platform].busy++;
      else result[s.platform].offline++;
    }
    return result;
  }
}
