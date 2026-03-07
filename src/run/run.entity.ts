import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type RunMode = 'single' | 'batch' | 'chain' | 'stream';
export type RunStatus =
  | 'pending' | 'running' | 'passed' | 'failed'
  | 'cancelled' | 'partial' | 'infra_failed';

@Entity('runs')
export class RunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', default: 'single' })
  mode: RunMode;

  @Column({ type: 'varchar' })
  platform: string;

  @Column('uuid', { array: true, default: '{}' })
  scenarioIds: string[];

  @Column({ type: 'varchar', default: 'pending' })
  status: RunStatus;

  @Column({ type: 'int', default: 1 })
  concurrency: number;

  @Column({ type: 'int', default: 0 })
  totalScenarios: number;

  @Column({ type: 'int', default: 0 })
  passedCount: number;

  @Column({ type: 'int', default: 0 })
  failedCount: number;

  @Column({ type: 'int', default: 0 })
  skippedCount: number;

  @Column({ type: 'uuid', nullable: true })
  scheduleId?: string;

  @Column({ type: 'uuid', nullable: true })
  streamId?: string;

  @Column({ type: 'jsonb', default: {} })
  options: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
