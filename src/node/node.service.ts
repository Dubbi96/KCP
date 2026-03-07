import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { NodeEntity, NodeStatus } from './node.entity';
import { RegisterNodeDto, HeartbeatDto } from './dto/register-node.dto';
import { DeviceService } from '../device/device.service';
import { SlotService } from '../slot/slot.service';

@Injectable()
export class NodeService {
  constructor(
    @InjectRepository(NodeEntity)
    private readonly repo: Repository<NodeEntity>,
    private readonly deviceService: DeviceService,
    private readonly slotService: SlotService,
  ) {}

  async register(dto: RegisterNodeDto) {
    const existing = await this.repo.findOne({
      where: { host: dto.host, port: dto.port },
    });
    if (existing) {
      throw new ConflictException(
        `Node already registered at ${dto.host}:${dto.port}. ` +
        `Use token ${existing.apiToken} or unregister first.`,
      );
    }

    const token = `ktn_${uuid().replace(/-/g, '')}`;
    const node = this.repo.create({
      ...dto,
      labels: dto.labels || [],
      apiToken: token,
      status: 'online' as NodeStatus,
      lastHeartbeatAt: new Date(),
    });
    const saved = await this.repo.save(node);

    await this.slotService.syncSlotsForNode(saved.id, dto.platforms);

    return { id: saved.id, apiToken: token };
  }

  async heartbeat(nodeId: string, dto: HeartbeatDto) {
    const node = await this.repo.findOne({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    node.status = dto.status as NodeStatus;
    node.lastHeartbeatAt = new Date();
    if (dto.cpuCores !== undefined) node.cpuCores = dto.cpuCores;
    if (dto.memoryMb !== undefined) node.memoryMb = dto.memoryMb;
    if (dto.diskGb !== undefined) node.diskGb = dto.diskGb;
    if (dto.cpuUsagePercent !== undefined) node.cpuUsagePercent = dto.cpuUsagePercent;
    if (dto.memoryUsagePercent !== undefined) node.memoryUsagePercent = dto.memoryUsagePercent;
    node.metadata = {
      ...node.metadata,
      loadAverage: dto.loadAverage,
      activeSessions: dto.activeSessions,
      appiumHealth: dto.appiumHealth,
      playwrightHealth: dto.playwrightHealth,
    };

    await this.repo.save(node);

    if (dto.devices) {
      await this.deviceService.syncFromHeartbeat(nodeId, dto.devices);
    }

    if (dto.slots) {
      await this.slotService.updateSlotStatus(nodeId, dto.slots);
    }

    return { ok: true };
  }

  async findAll(): Promise<NodeEntity[]> {
    return this.repo.find({ order: { registeredAt: 'DESC' } });
  }

  async findOne(id: string): Promise<NodeEntity> {
    const node = await this.repo.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async findByToken(token: string): Promise<NodeEntity | null> {
    return this.repo.findOne({ where: { apiToken: token } });
  }

  async setStatus(id: string, status: NodeStatus) {
    await this.repo.update(id, { status });
    if (status === 'offline' || status === 'maintenance') {
      await this.slotService.markNodeSlotsOffline(id);
      await this.deviceService.markNodeDevicesOffline(id);
    }
  }

  async unregister(id: string) {
    const node = await this.findOne(id);
    await this.slotService.removeNodeSlots(id);
    await this.deviceService.removeNodeDevices(id);
    await this.repo.remove(node);
    return { ok: true };
  }

  async findOnlineNodes(): Promise<NodeEntity[]> {
    return this.repo.find({ where: { status: 'online' as NodeStatus } });
  }

  async markStaleNodesOffline(timeoutSec: number) {
    const cutoff = new Date(Date.now() - timeoutSec * 1000);
    const stale = await this.repo
      .createQueryBuilder('n')
      .where('n.status = :status', { status: 'online' })
      .andWhere('n.lastHeartbeatAt < :cutoff', { cutoff })
      .getMany();

    for (const node of stale) {
      console.log(`[KCP] Node ${node.name} (${node.id}) went offline — no heartbeat since ${node.lastHeartbeatAt}`);
      await this.setStatus(node.id, 'offline');
    }
    return stale.length;
  }
}
