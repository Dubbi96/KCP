import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResourceService } from './resource.service';

@Controller('resources')
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Get('pool')
  async getPoolOverview() {
    return this.service.getPoolOverview();
  }

  @Get('capacity')
  async getCapacity(@Query('tenantId') tenantId?: string) {
    return this.service.getCapacitySummary(tenantId);
  }

  @Get('nodes/:id')
  async getNodeDetail(@Param('id') id: string) {
    return this.service.getNodeDetail(id);
  }

  @Get('best-node')
  async selectBestNode(
    @Query('platform') platform: string,
    @Query('labels') labels?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    const labelArr = labels ? labels.split(',').filter(Boolean) : undefined;
    const nodeId = await this.service.selectBestNode(platform, labelArr, deviceId);
    return { nodeId };
  }
}
