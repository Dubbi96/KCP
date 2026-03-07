import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type JobStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retry_pending';

@Entity('jobs')
export class JobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  runId?: string;

  @Column({ type: 'uuid', nullable: true })
  scenarioRunId?: string;

  @Column({ type: 'uuid', nullable: true })
  scenarioId?: string;

  @Column({ type: 'varchar' })
  platform: string;

  @Column('text', { array: true, default: '{}' })
  requiredLabels: string[];

  @Column({ type: 'uuid', nullable: true })
  requiredDeviceId?: string;

  @Column({ type: 'uuid', nullable: true })
  assignedNodeId?: string;

  @Column({ type: 'uuid', nullable: true })
  assignedSlotId?: string;

  @Column({ type: 'uuid', nullable: true })
  assignedDeviceId?: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: JobStatus;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  attempt: number;

  @Column({ type: 'int', default: 3 })
  maxAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
