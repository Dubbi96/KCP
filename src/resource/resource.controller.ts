import { Controller, Get, Param } from '@nestjs/common';
import { ResourceService } from './resource.service';

@Controller('resources')
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Get('pool')
  async getPoolOverview() {
    return this.service.getPoolOverview();
  }

  @Get('nodes/:id')
  async getNodeDetail(@Param('id') id: string) {
    return this.service.getNodeDetail(id);
  }

  @Get('best-node')
  async selectBestNode(
    @Param('platform') platform: string,
  ) {
    const nodeId = await this.service.selectBestNode(platform);
    return { nodeId };
  }
}
