import {
  Controller, Post, Get, Delete, Body, Param, Req, Query,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { JobService } from './job.service';
import { NodeTokenGuard } from '../auth/node-token.guard';
import { KcpAuthGuard } from '../auth/kcp-auth.guard';

@Controller('jobs')
export class JobController {
  constructor(private readonly service: JobService) {}

  @Post()
  @UseGuards(KcpAuthGuard)
  async create(@Body() body: {
    tenantId: string;
    runId?: string;
    scenarioRunId?: string;
    scenarioId?: string;
    platform: string;
    payload?: Record<string, any>;
    requiredLabels?: string[];
    requiredDeviceId?: string;
    priority?: number;
  }) {
    return this.service.create(body);
  }

  @Post('claim')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async claim(@Req() req, @Body('platforms') platforms: string[]) {
    const job = await this.service.claim(req.node.id, platforms);
    return job || { noJob: true };
  }

  @Post(':id/started')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async reportStarted(@Param('id') id: string, @Req() req) {
    return this.service.reportStarted(id, req.node.id);
  }

  @Post(':id/completed')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async reportCompleted(
    @Param('id') id: string,
    @Body() result: Record<string, any>,
    @Req() req,
  ) {
    return this.service.reportCompleted(id, result, req.node.id);
  }

  @Delete(':id')
  @UseGuards(KcpAuthGuard)
  async cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Get('pending')
  @UseGuards(KcpAuthGuard)
  async findPending(@Query('platform') platform?: string) {
    return this.service.findPending(platform);
  }

  @Get('stats')
  @UseGuards(KcpAuthGuard)
  async getStats() {
    return this.service.getStats();
  }

  @Get('run/:runId')
  @UseGuards(KcpAuthGuard)
  async findByRun(@Param('runId') runId: string) {
    return this.service.findByRun(runId);
  }
}
