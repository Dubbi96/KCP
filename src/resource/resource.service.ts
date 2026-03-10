import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NodeService } from '../node/node.service';
import { DeviceService } from '../device/device.service';
import { SlotService } from '../slot/slot.service';
import { LeaseService } from '../lease/lease.service';
import { JobService } from '../job/job.service';
import { JobEntity } from '../job/job.entity';

const CPU_THRESHOLD = 90;    // Don't assign to nodes with CPU > 90%
const MEMORY_THRESHOLD = 90; // Don't assign to nodes with memory > 90%

@Injectable()
export class ResourceService {
  private readonly logger = new Logger('ResourceService');

  constructor(
    private readonly nodeService: NodeService,
    private readonly deviceService: DeviceService,
    private readonly slotService: SlotService,
    private readonly leaseService: LeaseService,
    private readonly jobService: JobService,
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
  ) {}

  async getPoolOverview() {
    const nodes = await this.nodeService.findAll();
    const slotSummary = await this.slotService.getPoolSummary();
    const devices = await this.deviceService.findAll();
    const activeLeases = await this.leaseService.findActive();
    const jobStats = await this.jobService.getStats();

    const onlineNodes = nodes.filter((n) => n.status === 'online');
    const drainingNodes = nodes.filter((n) => n.status === 'draining');
    const totalCpu = onlineNodes.reduce((s, n) => s + n.cpuCores, 0);
    const totalMemory = onlineNodes.reduce((s, n) => s + n.memoryMb, 0);
    const avgCpuUsage = onlineNodes.length
      ? onlineNodes.reduce((s, n) => s + n.cpuUsagePercent, 0) / onlineNodes.length
      : 0;
    const avgMemUsage = onlineNodes.length
      ? onlineNodes.reduce((s, n) => s + n.memoryUsagePercent, 0) / onlineNodes.length
      : 0;

    const devicesByPlatform: Record<string, { total: number; available: number; leased: number; offline: number; quarantined: number }> = {};
    for (const d of devices) {
      if (!devicesByPlatform[d.platform])
        devicesByPlatform[d.platform] = { total: 0, available: 0, leased: 0, offline: 0, quarantined: 0 };
      devicesByPlatform[d.platform].total++;
      const isQuarantined = d.quarantineUntil && new Date(d.quarantineUntil) > new Date();
      if (isQuarantined) devicesByPlatform[d.platform].quarantined++;
      else if (d.status === 'available') devicesByPlatform[d.platform].available++;
      else if (d.status === 'leased') devicesByPlatform[d.platform].leased++;
      else devicesByPlatform[d.platform].offline++;
    }

    // Compute operational metrics
    const recentJobs = await this.jobRepo.find({
      where: { status: In(['completed', 'failed']) },
      order: { completedAt: 'DESC' },
      take: 100,
    });
    const failedCount = recentJobs.filter((j) => j.status === 'failed').length;
    const infraFailed = recentJobs.filter((j) => j.result?.infraFailure).length;

    return {
      cluster: {
        totalNodes: nodes.length,
        onlineNodes: onlineNodes.length,
        drainingNodes: drainingNodes.length,
        offlineNodes: nodes.filter((n) => n.status === 'offline').length,
        totalCpuCores: totalCpu,
        totalMemoryMb: totalMemory,
        avgCpuUsagePercent: Math.round(avgCpuUsage * 10) / 10,
        avgMemoryUsagePercent: Math.round(avgMemUsage * 10) / 10,
      },
      slots: slotSummary,
      devices: devicesByPlatform,
      activeLeases: activeLeases.length,
      jobs: jobStats,
      metrics: {
        recentJobCount: recentJobs.length,
        recentFailRate: recentJobs.length ? Math.round(failedCount / recentJobs.length * 1000) / 10 : 0,
        recentInfraFailRate: recentJobs.length ? Math.round(infraFailed / recentJobs.length * 1000) / 10 : 0,
      },
    };
  }

  async getNodeDetail(nodeId: string) {
    const node = await this.nodeService.findOne(nodeId);
    const slots = await this.slotService.countByNode(nodeId);
    const devices = await this.deviceService.findAll({ nodeId });
    const activeJobs = await this.jobService.findNodeActiveJobs(nodeId);
    const leases = await this.leaseService.findActive({ nodeId });

    // Node-specific failure rate
    const recentNodeJobs = await this.jobRepo.find({
      where: { assignedNodeId: nodeId, status: In(['completed', 'failed']) },
      order: { completedAt: 'DESC' },
      take: 50,
    });
    const nodeFailRate = recentNodeJobs.length
      ? recentNodeJobs.filter((j) => j.status === 'failed').length / recentNodeJobs.length
      : 0;

    return { node, slots, devices, activeJobs, leases, nodeFailRate: Math.round(nodeFailRate * 1000) / 10 };
  }

  /**
   * Select best node for job assignment with enhanced scoring:
   * - CPU/memory threshold gates
   * - Available slot weight
   * - Active job penalty
   * - Recent failure penalty
   * - Device affinity bonus
   * - Draining nodes excluded
   */
  async selectBestNode(platform: string, requiredLabels?: string[], preferredDeviceId?: string): Promise<string | null> {
    const nodes = await this.nodeService.findOnlineNodes();
    if (!nodes.length) return null;

    const candidates: Array<{ nodeId: string; score: number }> = [];

    for (const node of nodes) {
      if (!node.platforms.includes(platform)) continue;
      if (requiredLabels?.length && !requiredLabels.every((l) => node.labels.includes(l))) continue;

      // Capacity threshold gates — skip overloaded nodes
      if (node.cpuUsagePercent > CPU_THRESHOLD) continue;
      if (node.memoryUsagePercent > MEMORY_THRESHOLD) continue;

      const slots = await this.slotService.countByNode(node.id);
      const platformSlots = slots[platform];
      if (!platformSlots || platformSlots.available === 0) continue;

      if (platform !== 'web') {
        const avail = await this.deviceService.findAvailable(platform, node.id);
        if (!avail.length) continue;
        if (preferredDeviceId && !avail.some((d) => d.id === preferredDeviceId)) continue;
      }

      const activeJobs = await this.jobService.findNodeActiveJobs(node.id);

      // Recent failure penalty
      const recentJobs = await this.jobRepo.find({
        where: { assignedNodeId: node.id, status: In(['completed', 'failed']) },
        order: { completedAt: 'DESC' },
        take: 20,
      });
      const recentFailures = recentJobs.filter((j) => j.status === 'failed').length;

      let score = 0;
      score += (100 - node.cpuUsagePercent);       // CPU headroom (0-100)
      score += (100 - node.memoryUsagePercent);     // Memory headroom (0-100)
      score += platformSlots.available * 15;         // Available slots bonus
      score -= activeJobs.length * 20;               // Active job penalty
      score -= recentFailures * 10;                  // Recent failure penalty

      // Device affinity bonus
      if (preferredDeviceId && platform !== 'web') {
        const devs = await this.deviceService.findAvailable(platform, node.id);
        if (devs.some((d) => d.id === preferredDeviceId)) score += 50;
      }

      candidates.push({ nodeId: node.id, score });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].nodeId;
  }

  /**
   * Customer-facing capacity view: abstract capacity by platform, not raw node details.
   */
  async getCapacitySummary(tenantId?: string) {
    const slotSummary = await this.slotService.getPoolSummary();
    const devices = await this.deviceService.findAll();

    const capacity: Record<string, { totalSlots: number; availableSlots: number; totalDevices: number; availableDevices: number }> = {};

    for (const [platform, counts] of Object.entries(slotSummary)) {
      const platformDevices = devices.filter((d) => d.platform === platform);
      capacity[platform] = {
        totalSlots: (counts as any).total || 0,
        availableSlots: (counts as any).available || 0,
        totalDevices: platformDevices.length,
        availableDevices: platformDevices.filter((d) => d.status === 'available').length,
      };
    }

    // Add web if not in slot summary (web doesn't need devices)
    if (!capacity.web) {
      capacity.web = { totalSlots: 0, availableSlots: 0, totalDevices: 0, availableDevices: 0 };
    }

    // Tenant-specific active leases
    let tenantLeases = 0;
    if (tenantId) {
      const leases = await this.leaseService.findActive({ tenantId });
      tenantLeases = leases.length;
    }

    return { capacity, tenantActiveLeases: tenantLeases };
  }

  /**
   * Capacity forecast for a platform: available resources, pending jobs, estimated delay.
   */
  async getCapacityForecast(platform: string) {
    const slotSummary = await this.slotService.getPoolSummary();
    const platformSlots = (slotSummary as any)[platform] || { total: 0, available: 0, busy: 0 };

    const devices = platform !== 'web'
      ? await this.deviceService.findAvailable(platform)
      : [];

    const pendingJobs = await this.jobRepo.count({
      where: { platform, status: 'pending' as any },
    });

    const runningJobs = await this.jobRepo.count({
      where: { platform, status: In(['assigned', 'running']) as any },
    });

    // Quarantined devices count
    const allDevices = platform !== 'web'
      ? await this.deviceService.findAll({ platform })
      : [];
    const quarantinedCount = allDevices.filter(
      d => d.quarantineUntil && new Date(d.quarantineUntil) > new Date()
    ).length;

    // Estimated queue delay (rough: pending / max(available, 1) * avg job duration)
    const availableCapacity = Math.max(platformSlots.available, 1);
    const estimatedDelayMinutes = Math.round((pendingJobs / availableCapacity) * 5); // assume ~5 min avg job

    return {
      platform,
      slots: platformSlots,
      availableDevices: devices.length,
      quarantinedDevices: quarantinedCount,
      pendingJobs,
      runningJobs,
      estimatedQueueDelayMinutes: estimatedDelayMinutes,
      hasCapacity: platformSlots.available > 0 && (platform === 'web' || devices.length > 0),
    };
  }
}
