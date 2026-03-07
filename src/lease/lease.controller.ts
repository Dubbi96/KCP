import {
  Controller, Post, Delete, Get, Patch, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { LeaseService } from './lease.service';
import { KcpAuthGuard } from '../auth/kcp-auth.guard';

@Controller('leases')
@UseGuards(KcpAuthGuard)
export class LeaseController {
  constructor(private readonly service: LeaseService) {}

  @Post('slot')
  async acquireSlot(@Body() body: {
    platform: string;
    tenantId: string;
    userId?: string;
    runId?: string;
    scenarioRunId?: string;
    preferredNodeId?: string;
    ttlSec?: number;
  }) {
    return this.service.acquireSlot(body);
  }

  @Post('device')
  async acquireDevice(@Body() body: {
    platform: string;
    tenantId: string;
    userId?: string;
    deviceId?: string;
    ttlSec?: number;
  }) {
    return this.service.acquireDevice(body);
  }

  @Delete(':id')
  async release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Patch(':id/renew')
  async renew(@Param('id') id: string, @Body('ttlSec') ttlSec?: number) {
    return this.service.renew(id, ttlSec);
  }

  @Get()
  async findActive(
    @Query('tenantId') tenantId?: string,
    @Query('nodeId') nodeId?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.service.findActive({ tenantId, nodeId, resourceType });
  }
}
