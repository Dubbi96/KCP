import {
  Controller, Post, Get, Delete, Body, Param, Query,
  UseGuards, HttpCode, Req,
} from '@nestjs/common';
import { RunService } from './run.service';
import { CreateRunDto } from './dto/create-run.dto';
import { NodeTokenGuard } from '../auth/node-token.guard';
import { KcpAuthGuard } from '../auth/kcp-auth.guard';
import { PauseService } from '../pause/pause.service';
import { SignalService } from '../signal/signal.service';

@Controller('runs')
export class RunController {
  constructor(
    private readonly runService: RunService,
    private readonly pauseService: PauseService,
    private readonly signalService: SignalService,
  ) {}

  @Post()
  @UseGuards(KcpAuthGuard)
  async create(@Body() dto: CreateRunDto) {
    return this.runService.create(dto);
  }

  @Get()
  @UseGuards(KcpAuthGuard)
  async findAll(
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.runService.findAll(tenantId, Number(limit) || 20, Number(offset) || 0);
  }

  @Get(':id')
  @UseGuards(KcpAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.runService.findOne(id);
  }

  @Post(':id/cancel')
  @UseGuards(KcpAuthGuard)
  @HttpCode(200)
  async cancel(@Param('id') id: string) {
    return this.runService.cancel(id);
  }

  @Post(':id/pause')
  @UseGuards(KcpAuthGuard)
  @HttpCode(200)
  async pause(@Param('id') id: string) {
    return this.pauseService.pauseRun(id);
  }

  @Post(':id/resume')
  @UseGuards(KcpAuthGuard)
  @HttpCode(200)
  async resume(@Param('id') id: string) {
    return this.pauseService.resumeRun(id);
  }

  // --- Runner callbacks (from KRC nodes) ---

  @Post('scenario-runs/:srId/started')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async onStarted(@Param('srId') srId: string, @Req() req) {
    return this.runService.onScenarioRunStarted(srId, req.node.id);
  }

  @Post('scenario-runs/:srId/completed')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async onCompleted(@Param('srId') srId: string, @Body() result: any, @Req() req) {
    if (result.signals || result.error) {
      const decision = this.signalService.getRetryDecision(
        { ...result.signals, status: result.status, errorMessage: result.error },
        result.attempt || 0,
      );
      result.retryDecision = decision;
    }
    return this.runService.onScenarioRunCompleted(srId, result, req.node.id);
  }

  @Get('scenario-runs/:srId')
  @UseGuards(KcpAuthGuard)
  async getScenarioRun(@Param('srId') srId: string) {
    return this.runService.getScenarioRun(srId);
  }
}
