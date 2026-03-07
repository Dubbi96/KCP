import { Controller, Get, Query } from '@nestjs/common';
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
}
