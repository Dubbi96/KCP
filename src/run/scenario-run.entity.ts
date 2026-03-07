import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { RunEntity } from './run.entity';

export type ScenarioRunStatus =
  | 'queued' | 'running' | 'passed' | 'failed'
  | 'skipped' | 'infra_failed' | 'cancelled' | 'paused';

@Entity('scenario_runs')
export class ScenarioRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  runId: string;

  @ManyToOne(() => RunEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: RunEntity;

  @Column({ type: 'uuid' })
  scenarioId: string;

  @Column({ type: 'int', default: 0 })
  sequenceNo: number;

  @Column({ type: 'varchar', default: 'queued' })
  status: ScenarioRunStatus;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  signals?: Record<string, any>;

  @Column({ type: 'uuid', nullable: true })
  assignedNodeId?: string;

  @Column({ type: 'uuid', nullable: true })
  jobId?: string;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
