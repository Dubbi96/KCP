import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ScheduleEntity } from './schedule.entity';

export type PlannedRunStatus = 'planned' | 'queued' | 'running' | 'completed' | 'skipped';

@Entity('planned_runs')
export class PlannedRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  scheduleId: string;

  @ManyToOne(() => ScheduleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule: ScheduleEntity;

  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @Column({ type: 'varchar', default: 'planned' })
  status: PlannedRunStatus;

  @Column({ type: 'uuid', nullable: true })
  runId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
