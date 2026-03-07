import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ScheduleEntity } from './schedule.entity';
import { PlannedRunEntity, PlannedRunStatus } from './planned-run.entity';
import { RunService } from '../run/run.service';

const LOCK_SCHEDULE_DAEMON = 100_005;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger('ScheduleService');

  constructor(
    @InjectRepository(ScheduleEntity)
    private readonly schedRepo: Repository<ScheduleEntity>,
    @InjectRepository(PlannedRunEntity)
    private readonly plannedRepo: Repository<PlannedRunEntity>,
    private readonly runService: RunService,
    private readonly dataSource: DataSource,
  ) {}

  // --- CRUD ---

  async create(data: Partial<ScheduleEntity>) {
    const sched = this.schedRepo.create(data);
    const saved = await this.schedRepo.save(sched);
    if (saved.type === 'cron') await this.maintainLookahead(saved);
    if (saved.type === 'at' && saved.runAt) {
      await this.plannedRepo.save(this.plannedRepo.create({
        scheduleId: saved.id, scheduledAt: saved.runAt,
      }));
    }
    return saved;
  }

  async findAll(tenantId: string) {
    return this.schedRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const sched = await this.schedRepo.findOne({ where: { id } });
    if (!sched) throw new NotFoundException('Schedule not found');
    const plannedRuns = await this.plannedRepo.find({
      where: { scheduleId: id },
      order: { scheduledAt: 'ASC' },
      take: 10,
    });
    return { ...sched, plannedRuns };
  }

  async update(id: string, data: Partial<ScheduleEntity>) {
    await this.schedRepo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.plannedRepo.delete({ scheduleId: id });
    await this.schedRepo.delete(id);
    return { ok: true };
  }

  // --- CRON Lookahead ---

  private async maintainLookahead(sched: ScheduleEntity) {
    if (sched.type !== 'cron' || !sched.cronExpression || !sched.enabled) return;

    const existing = await this.plannedRepo.count({
      where: { scheduleId: sched.id, status: 'planned' as PlannedRunStatus },
    });

    const needed = sched.lookaheadCount - existing;
    if (needed <= 0) return;

    try {
      // Dynamic import for cron-parser
      const { parseExpression } = await import('cron-parser');
      const lastPlanned = await this.plannedRepo.findOne({
        where: { scheduleId: sched.id },
        order: { scheduledAt: 'DESC' },
      });

      const options: any = {};
      if (sched.timezone) options.tz = sched.timezone;
      if (lastPlanned) options.currentDate = lastPlanned.scheduledAt;

      const interval = parseExpression(sched.cronExpression, options);

      for (let i = 0; i < needed; i++) {
        const next = interval.next();
        await this.plannedRepo.save(this.plannedRepo.create({
          scheduleId: sched.id,
          scheduledAt: next.toDate(),
        }));
      }
    } catch (e: any) {
      this.logger.warn(`Failed to compute CRON for schedule ${sched.id}: ${e.message}`);
    }
  }

  // --- Scheduler Daemon (30s tick) ---

  @Interval(30_000)
  async processDueRuns() {
    // Leader election: only one KCP instance runs the scheduler
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const [result] = await qr.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [LOCK_SCHEDULE_DAEMON],
      );
      if (!result.acquired) return;
      try {
        await this._processDueRuns();
      } finally {
        await qr.query('SELECT pg_advisory_unlock($1)', [LOCK_SCHEDULE_DAEMON]);
      }
    } finally {
      await qr.release();
    }
  }

  private async _processDueRuns() {
    const now = new Date();
    const dueRuns = await this.plannedRepo.find({
      where: {
        status: 'planned' as PlannedRunStatus,
        scheduledAt: LessThanOrEqual(now),
      },
      relations: ['schedule'],
      take: 20,
    });

    for (const planned of dueRuns) {
      if (!planned.schedule?.enabled) {
        planned.status = 'skipped';
        await this.plannedRepo.save(planned);
        continue;
      }

      const sched = planned.schedule;

      // Overlap check
      if (sched.overlapPolicy === 'skip') {
        const running = await this.plannedRepo.count({
          where: { scheduleId: sched.id, status: 'running' as PlannedRunStatus },
        });
        if (running > 0) {
          planned.status = 'skipped';
          await this.plannedRepo.save(planned);
          continue;
        }
      }

      try {
        planned.status = 'running';
        await this.plannedRepo.save(planned);

        const run = await this.runService.create({
          tenantId: sched.tenantId,
          scenarioIds: sched.scenarioIds,
          platform: sched.platform,
          mode: sched.runMode,
          options: sched.options,
          scheduleId: sched.id,
        });

        planned.runId = run.id;
        planned.status = 'completed';
        await this.plannedRepo.save(planned);

        this.logger.log(`Schedule ${sched.name}: created run ${run.id}`);
      } catch (e: any) {
        planned.status = 'skipped';
        await this.plannedRepo.save(planned);
        this.logger.error(`Schedule ${sched.name} failed: ${e.message}`);
      }

      // Replenish lookahead for CRON
      if (sched.type === 'cron') await this.maintainLookahead(sched);

      // Disable AT schedule after execution
      if (sched.type === 'at') {
        sched.enabled = false;
        await this.schedRepo.save(sched);
      }
    }
  }

  // --- AFTER trigger ---

  async onRunCompleted(runId: string, status: string) {
    const afterSchedules = await this.schedRepo.find({
      where: { type: 'after' as any, triggerSourceId: runId, enabled: true },
    });

    for (const sched of afterSchedules) {
      const trigger = sched.triggerOn || 'any';
      if (trigger === 'done' && status !== 'passed') continue;
      if (trigger === 'fail' && status !== 'failed') continue;

      const delay = sched.delayMs || 0;
      const scheduledAt = new Date(Date.now() + delay);

      await this.plannedRepo.save(this.plannedRepo.create({
        scheduleId: sched.id,
        scheduledAt,
      }));
      this.logger.log(`AFTER schedule ${sched.name}: triggered by run ${runId} (${status})`);
    }
  }
}
