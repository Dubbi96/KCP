import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioRunEntity } from '../run/scenario-run.entity';
import { RunEntity } from '../run/run.entity';
import { JobService } from '../job/job.service';

/**
 * Pause/Resume Controller
 *
 * Pauses running/queued scenario runs and resumes them by
 * creating new scenario runs and re-enqueueing jobs.
 */
@Injectable()
export class PauseService {
  private readonly logger = new Logger('PauseService');

  constructor(
    @InjectRepository(ScenarioRunEntity)
    private readonly srRepo: Repository<ScenarioRunEntity>,
    @InjectRepository(RunEntity)
    private readonly runRepo: Repository<RunEntity>,
    private readonly jobService: JobService,
  ) {}

  async pauseRun(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const srs = await this.srRepo.find({ where: { runId } });
    let pausedCount = 0;

    for (const sr of srs) {
      if (sr.status === 'running' || sr.status === 'queued') {
        sr.status = 'paused';
        sr.completedAt = new Date();
        await this.srRepo.save(sr);

        if (sr.jobId) {
          await this.jobService.cancel(sr.jobId).catch(() => {});
        }
        pausedCount++;
      }
    }

    this.logger.log(`Paused ${pausedCount} scenario run(s) in run ${runId}`);
    return { runId, pausedCount };
  }

  async resumeRun(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');

    const srs = await this.srRepo.find({ where: { runId } });
    const pausedSrs = srs.filter((s) => s.status === 'paused');
    let resumedCount = 0;

    for (const sr of pausedSrs) {
      // Cancel paused one and create a fresh scenario run
      sr.status = 'cancelled';
      await this.srRepo.save(sr);

      const newSr = this.srRepo.create({
        runId,
        scenarioId: sr.scenarioId,
        sequenceNo: sr.sequenceNo,
        status: 'queued',
        attempt: sr.attempt,
      });
      const saved = await this.srRepo.save(newSr);

      // Create new job
      const job = await this.jobService.create({
        tenantId: run.tenantId,
        runId: run.id,
        scenarioRunId: saved.id,
        scenarioId: sr.scenarioId,
        platform: run.platform,
        payload: {
          ...run.options,
          scenarioRunId: saved.id,
          runId: run.id,
          scenarioId: sr.scenarioId,
          sequenceNo: sr.sequenceNo,
          attempt: sr.attempt,
        },
      });

      saved.jobId = job.id;
      await this.srRepo.save(saved);
      resumedCount++;
    }

    // Re-set run status to running
    if (resumedCount > 0) {
      run.status = 'running';
      run.completedAt = undefined;
      await this.runRepo.save(run);
    }

    this.logger.log(`Resumed ${resumedCount} scenario run(s) in run ${runId}`);
    return { runId, resumedCount };
  }

  async pauseScenarioRun(scenarioRunId: string) {
    const sr = await this.srRepo.findOne({ where: { id: scenarioRunId } });
    if (!sr) throw new NotFoundException('ScenarioRun not found');

    if (sr.status === 'running' || sr.status === 'queued') {
      sr.status = 'paused';
      await this.srRepo.save(sr);
      if (sr.jobId) await this.jobService.cancel(sr.jobId).catch(() => {});
    }
    return sr;
  }
}
