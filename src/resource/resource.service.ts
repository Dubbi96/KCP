import { Injectable } from '@nestjs/common';
import { NodeService } from '../node/node.service';
import { DeviceService } from '../device/device.service';
import { SlotService } from '../slot/slot.service';
import { LeaseService } from '../lease/lease.service';
import { JobService } from '../job/job.service';

@Injectable()
export class ResourceService {
  constructor(
    private readonly nodeService: NodeService,
    private readonly deviceService: DeviceService,
    private readonly slotService: SlotService,
    private readonly leaseService: LeaseService,
    private readonly jobService: JobService,
  ) {}

  async getPoolOverview() {
    const nodes = await this.nodeService.findAll();
    const slotSummary = await this.slotService.getPoolSummary();
    const devices = await this.deviceService.findAll();
    const activeLeases = await this.leaseService.findActive();
    const jobStats = await this.jobService.getStats();

    const onlineNodes = nodes.filter((n) => n.status === 'online');
    const totalCpu = onlineNodes.reduce((s, n) => s + n.cpuCores, 0);
    const totalMemory = onlineNodes.reduce((s, n) => s + n.memoryMb, 0);
    const avgCpuUsage = onlineNodes.length
      ? onlineNodes.reduce((s, n) => s + n.cpuUsagePercent, 0) / onlineNodes.length
      : 0;
    const avgMemUsage = onlineNodes.length
      ? onlineNodes.reduce((s, n) => s + n.memoryUsagePercent, 0) / onlineNodes.length
      : 0;

    const devicesByPlatform: Record<string, { total: number; available: number; leased: number; offline: number }> = {};
    for (const d of devices) {
      if (!devicesByPlatform[d.platform])
        devicesByPlatform[d.platform] = { total: 0, available: 0, leased: 0, offline: 0 };
      devicesByPlatform[d.platform].total++;
      if (d.status === 'available') devicesByPlatform[d.platform].available++;
      else if (d.status === 'leased') devicesByPlatform[d.platform].leased++;
      else devicesByPlatform[d.platform].offline++;
    }

    return {
      cluster: {
        totalNodes: nodes.length,
        onlineNodes: onlineNodes.length,
        totalCpuCores: totalCpu,
        totalMemoryMb: totalMemory,
        avgCpuUsagePercent: Math.round(avgCpuUsage * 10) / 10,
        avgMemoryUsagePercent: Math.round(avgMemUsage * 10) / 10,
      },
      slots: slotSummary,
      devices: devicesByPlatform,
      activeLeases: activeLeases.length,
      jobs: jobStats,
    };
  }

  async getNodeDetail(nodeId: string) {
    const node = await this.nodeService.findOne(nodeId);
    const slots = await this.slotService.countByNode(nodeId);
    const devices = await this.deviceService.findAll({ nodeId });
    const activeJobs = await this.jobService.findNodeActiveJobs(nodeId);
    const leases = await this.leaseService.findActive({ nodeId });

    return { node, slots, devices, activeJobs, leases };
  }

  async selectBestNode(platform: string, requiredLabels?: string[], preferredDeviceId?: string): Promise<string | null> {
    const nodes = await this.nodeService.findOnlineNodes();
    if (!nodes.length) return null;

    const candidates: Array<{ nodeId: string; score: number }> = [];

    for (const node of nodes) {
      if (!node.platforms.includes(platform)) continue;
      if (requiredLabels?.length && !requiredLabels.every((l) => node.labels.includes(l))) continue;

      const slots = await this.slotService.countByNode(node.id);
      const platformSlots = slots[platform];
      if (!platformSlots || platformSlots.available === 0) continue;

      if (platform !== 'web') {
        const avail = await this.deviceService.findAvailable(platform, node.id);
        if (!avail.length) continue;
        if (preferredDeviceId && !avail.some((d) => d.id === preferredDeviceId)) continue;
      }

      const activeJobs = await this.jobService.findNodeActiveJobs(node.id);

      let score = 0;
      score += (100 - node.cpuUsagePercent);
      score += (100 - node.memoryUsagePercent);
      score += platformSlots.available * 15;
      score -= activeJobs.length * 20;
      if (preferredDeviceId) {
        const devs = await this.deviceService.findAvailable(platform, node.id);
        if (devs.some((d) => d.id === preferredDeviceId)) score += 50;
      }

      candidates.push({ nodeId: node.id, score });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].nodeId;
  }
}
