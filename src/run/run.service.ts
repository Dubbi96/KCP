import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RunEntity, RunStatus, RunMode } from './run.entity';
import { ScenarioRunEntity, ScenarioRunStatus } from './scenario-run.entity';
import { JobService } from '../job/job.service';
import { CreateRunDto } from './dto/create-run.dto';
import { WebhookService } from '../webhook/webhook.service';

@Injectable()
export class RunService {
  constructor(
    @InjectRepository(RunEntity)
    private readonly runRepo: Repository<RunEntity>,
    @InjectRepository(ScenarioRunEntity)
    private readonly srRepo: Repository<ScenarioRunEntity>,
    private readonly jobService: JobService,
    private readonly webhookService: WebhookService,
  ) {}

  async create(dto: CreateRunDto) {
    const mode = (dto.mode || 'single') as RunMode;
    const run = this.runRepo.create({
      tenantId: dto.tenantId,
      mode,
      platform: dto.platform,
      scenarioIds: dto.scenarioIds,
      concurrency: dto.concurrency || 1,
      totalScenarios: dto.scenarioIds.length,
      options: dto.options || {},
      scheduleId: dto.scheduleId,
      streamId: dto.streamId,
    });
    const saved = await this.runRepo.save(run);

    // Create ScenarioRun for each scenario
    const scenarioRuns: ScenarioRunEntity[] = [];
    for (let i = 0; i < dto.scenarioIds.length; i++) {
      const sr = this.srRepo.create({
        runId: saved.id,
        scenarioId: dto.scenarioIds[i],
        sequenceNo: i,
        status: 'queued' as ScenarioRunStatus,
      });
      scenarioRuns.push(await this.srRepo.save(sr));
    }

    // Enqueue jobs based on mode
    if (mode === 'chain') {
      // Chain: only enqueue the first scenario
      await this.enqueueScenarioRun(saved, scenarioRuns[0]);
    } else {
      // Single/Batch: enqueue all scenarios
      for (const sr of scenarioRuns) {
        await this.enqueueScenarioRun(saved, sr);
      }
    }

    saved.status = 'running';
    saved.startedAt = new Date();
    await this.runRepo.save(saved);

    this.webhookService.emit(saved.tenantId, 'run.created', {
      runId: saved.id, mode, platform: dto.platform,
      scenarioCount: dto.scenarioIds.length,
    }).catch(() => {});

    return saved;
  }

  private async enqueueScenarioRun(run: RunEntity, sr: ScenarioRunEntity) {
    const job = await this.jobService.create({
      tenantId: run.tenantId,
      runId: run.id,
      scenarioRunId: sr.id,
      scenarioId: sr.scenarioId,
      platform: run.platform,
      payload: {
        ...run.options,
        scenarioRunId: sr.id,
        runId: run.id,
        scenarioId: sr.scenarioId,
        sequenceNo: sr.sequenceNo,
        attempt: sr.attempt,
      },
    });
    sr.jobId = job.id;
    await this.srRepo.save(sr);
  }

  async onScenarioRunCompleted(scenarioRunId: string, result: {
    status: string;
    durationMs?: number;
    error?: string;
    resultJson?: any;
    signals?: any;
  }) {
    const sr = await this.srRepo.findOne({ where: { id: scenarioRunId } });
    if (!sr) return;

    sr.status = result.status as ScenarioRunStatus;
    sr.durationMs = result.durationMs;
    sr.error = result.error;
    sr.result = result.resultJson;
    sr.signals = result.signals;
    sr.completedAt = new Date();
    if (!sr.startedAt) sr.startedAt = new Date();
    await this.srRepo.save(sr);

    this.webhookService.emit(sr.runId ? (await this.runRepo.findOne({ where: { id: sr.runId } }))?.tenantId || '' : '', `scenario.${result.status}`, {
      scenarioRunId: sr.id, runId: sr.runId, scenarioId: sr.scenarioId,
      status: result.status, durationMs: result.durationMs, error: result.error,
    }).catch(() => {});

    // Check if run is complete
    await this.checkRunCompletion(sr.runId);
  }

  async onScenarioRunStarted(scenarioRunId: string) {
    const sr = await this.srRepo.findOne({ where: { id: scenarioRunId } });
    if (!sr) return;
    sr.status = 'running';
    sr.startedAt = new Date();
    sr.attempt++;
    await this.srRepo.save(sr);
  }

  private async checkRunCompletion(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run || run.status !== 'running') return;

    const srs = await this.srRepo.find({ where: { runId } });
    const completed = srs.filter((s) =>
      ['passed', 'failed', 'skipped', 'infra_failed', 'cancelled'].includes(s.status),
    );

    // Chain mode: advance to next scenario if current passed
    if (run.mode === 'chain') {
      const lastCompleted = completed.sort((a, b) => a.sequenceNo - b.sequenceNo).pop();
      if (lastCompleted && completed.length < srs.length) {
        const nextSr = srs.find((s) => s.sequenceNo === lastCompleted.sequenceNo + 1);
        if (nextSr && nextSr.status === 'queued') {
          if (lastCompleted.status === 'passed') {
            await this.enqueueScenarioRun(run, nextSr);
            return;
          }
          // Chain fails on first failure - cancel remaining
          for (const s of srs.filter((s) => s.status === 'queued')) {
            s.status = 'cancelled';
            await this.srRepo.save(s);
          }
        }
      }
    }

    // Check if all done
    if (completed.length >= srs.length) {
      run.passedCount = srs.filter((s) => s.status === 'passed').length;
      run.failedCount = srs.filter((s) => ['failed', 'infra_failed'].includes(s.status)).length;
      run.skippedCount = srs.filter((s) => ['skipped', 'cancelled'].includes(s.status)).length;
      run.status = run.failedCount > 0 ? 'failed' : run.passedCount === run.totalScenarios ? 'passed' : 'partial';
      run.completedAt = new Date();
      await this.runRepo.save(run);

      this.webhookService.emit(run.tenantId, `run.${run.status}`, {
        runId: run.id, mode: run.mode, passed: run.passedCount,
        failed: run.failedCount, skipped: run.skippedCount,
      }).catch(() => {});
    }
  }

  async cancel(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');
    if (['passed', 'failed', 'cancelled'].includes(run.status))
      throw new BadRequestException('Run already finished');

    const srs = await this.srRepo.find({ where: { runId } });
    for (const sr of srs) {
      if (['queued', 'running'].includes(sr.status)) {
        sr.status = 'cancelled';
        sr.completedAt = new Date();
        await this.srRepo.save(sr);
        if (sr.jobId) await this.jobService.cancel(sr.jobId).catch(() => {});
      }
    }

    run.status = 'cancelled';
    run.completedAt = new Date();
    run.skippedCount = srs.filter((s) => s.status === 'cancelled').length;
    await this.runRepo.save(run);

    this.webhookService.emit(run.tenantId, 'run.cancelled', { runId: run.id }).catch(() => {});
    return run;
  }

  async findAll(tenantId: string, limit = 20, offset = 0) {
    return this.runRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findOne(id: string) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Run not found');
    const scenarioRuns = await this.srRepo.find({
      where: { runId: id },
      order: { sequenceNo: 'ASC' },
    });
    return { ...run, scenarioRuns };
  }

  async getScenarioRun(id: string) {
    return this.srRepo.findOne({ where: { id } });
  }
}
