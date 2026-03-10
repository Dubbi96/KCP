import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { NodeEntity, NodeStatus } from './node.entity';
import { RegisterNodeDto, HeartbeatDto } from './dto/register-node.dto';
import { DeviceService } from '../device/device.service';
import { SlotService } from '../slot/slot.service';

@Injectable()
export class NodeService {
  private readonly logger = new Logger('NodeService');

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

    // Draining nodes keep their status — don't let heartbeat override it
    if (node.status !== 'draining' && node.status !== 'maintenance') {
      node.status = dto.status as NodeStatus;
    }
    node.lastHeartbeatAt = new Date();
    if (dto.cpuCores !== undefined) node.cpuCores = dto.cpuCores;
    if (dto.memoryMb !== undefined) node.memoryMb = dto.memoryMb;
    if (dto.diskGb !== undefined) node.diskGb = dto.diskGb;
    if (dto.diskUsagePercent !== undefined) node.metadata = { ...node.metadata, diskUsagePercent: dto.diskUsagePercent };
    if (dto.cpuUsagePercent !== undefined) node.cpuUsagePercent = dto.cpuUsagePercent;
    if (dto.memoryUsagePercent !== undefined) node.memoryUsagePercent = dto.memoryUsagePercent;
    node.metadata = {
      ...node.metadata,
      loadAverage: dto.loadAverage,
      activeSessions: dto.activeSessions,
      appiumHealth: dto.appiumHealth,
      playwrightHealth: dto.playwrightHealth,
      agentVersion: dto.agentVersion,
    };

    await this.repo.save(node);

    if (dto.devices) {
      await this.deviceService.syncFromHeartbeat(nodeId, dto.devices);
    }

    if (dto.slots) {
      await this.slotService.updateSlotStatus(nodeId, dto.slots);
    }

    // Sync device health from heartbeat (Phase 5)
    if ((dto as any).deviceHealth) {
      await this.deviceService.syncHealthFromHeartbeat(nodeId, (dto as any).deviceHealth);
    }

    // Return directives to the node (e.g., drain command)
    const directives: Record<string, any> = {};
    if (node.status === 'draining') {
      directives.drain = true;
    }

    return { ok: true, directives };
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

  /**
   * Set node status with side-effect handling.
   * 'draining' = stop assigning new jobs, wait for in-flight to finish.
   * 'maintenance' / 'offline' = immediately release resources.
   */
  async setStatus(id: string, status: NodeStatus) {
    const node = await this.repo.findOne({ where: { id } });
    if (!node) return;

    const prevStatus = node.status;
    node.status = status;
    await this.repo.save(node);

    if (status === 'offline' || status === 'maintenance') {
      await this.slotService.markNodeSlotsOffline(id);
      await this.deviceService.markNodeDevicesOffline(id);
    }

    this.logger.log(`Node ${node.name} status: ${prevStatus} → ${status}`);
  }

  /**
   * Initiate graceful drain: no new jobs assigned, wait for in-flight to complete.
   */
  async drain(id: string) {
    const node = await this.findOne(id);
    if (node.status === 'draining') return { nodeId: id, status: 'already_draining' };

    await this.setStatus(id, 'draining');
    return { nodeId: id, status: 'draining', message: 'Node will transition to offline when all active jobs complete.' };
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

  async findDrainingNodes(): Promise<NodeEntity[]> {
    return this.repo.find({ where: { status: 'draining' as NodeStatus } });
  }

  async markStaleNodesOffline(timeoutSec: number) {
    const cutoff = new Date(Date.now() - timeoutSec * 1000);
    const stale = await this.repo
      .createQueryBuilder('n')
      .where('n.status IN (:...statuses)', { statuses: ['online', 'draining'] })
      .andWhere('n.lastHeartbeatAt < :cutoff', { cutoff })
      .getMany();

    const ids: string[] = [];
    for (const node of stale) {
      this.logger.warn(`Node ${node.name} (${node.id}) went offline — no heartbeat since ${node.lastHeartbeatAt}`);
      await this.setStatus(node.id, 'offline');
      ids.push(node.id);
    }
    return ids;
  }
}
