import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { DeviceService } from './device.service';

@Controller('devices')
export class DeviceController {
  constructor(private readonly service: DeviceService) {}

  @Get()
  async findAll(
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('nodeId') nodeId?: string,
  ) {
    return this.service.findAll({ platform, status, nodeId });
  }

  @Get('available')
  async findAvailable(@Query('platform') platform: string) {
    return this.service.findAvailable(platform);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/health')
  async updateHealth(
    @Param('id') id: string,
    @Body() payload: {
      healthStatus: string;
      lastFailureCode?: string;
      failureCount?: number;
      consecutiveFailures?: number;
      lastRecoveryAction?: string;
    },
  ) {
    await this.service.updateHealth(id, payload);
    return { ok: true };
  }

  @Post(':id/quarantine')
  async quarantine(
    @Param('id') id: string,
    @Body() body: { durationMinutes?: number; reason?: string },
  ) {
    await this.service.quarantine(id, body.durationMinutes, body.reason);
    return { ok: true, message: `Device ${id} quarantined` };
  }

  @Delete(':id/quarantine')
  async unquarantine(@Param('id') id: string) {
    await this.service.unquarantine(id);
    return { ok: true, message: `Device ${id} removed from quarantine` };
  }

  @Post(':id/failure')
  async recordFailure(
    @Param('id') id: string,
    @Body() body: { failureCode: string },
  ) {
    const quarantined = await this.service.recordFailure(id, body.failureCode);
    return { ok: true, quarantined };
  }

  @Post(':id/success')
  async recordSuccess(@Param('id') id: string) {
    await this.service.recordSuccess(id);
    return { ok: true };
  }

  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getDeviceHistory(id, parseInt(limit || '50', 10));
  }

  @Post(':id/recovery-event')
  async recordRecoveryEvent(
    @Param('id') id: string,
    @Body() body: { action: string; failureCode: string; success: boolean; durationMs?: number; errorMessage?: string; nodeId?: string },
  ) {
    await this.service.recordRecoveryEvent(id, body);
    return { ok: true };
  }
}
