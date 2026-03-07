import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { KcpAuthGuard } from '../auth/kcp-auth.guard';

@Controller('webhooks')
@UseGuards(KcpAuthGuard)
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  @Post()
  async create(@Body() body: any) {
    return this.service.create(body);
  }

  @Get()
  async findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/events')
  async getEvents(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.getEvents(id, Number(limit) || 20);
  }

  @Post(':id/test')
  async testWebhook(@Param('id') id: string) {
    const wh = await this.service.findOne(id);
    await this.service.emit(wh.tenantId, 'test.event', {
      message: 'Test webhook event from Katab Control Plane',
      webhookId: id,
    });
    return { ok: true, message: 'Test event queued' };
  }
}
