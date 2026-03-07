import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type ScheduleType = 'cron' | 'at' | 'after';
export type MisfirePolicy = 'run_all' | 'run_latest_only' | 'skip_all';
export type OverlapPolicy = 'skip' | 'queue';

@Entity('schedules')
export class ScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  type: ScheduleType;

  @Column({ type: 'varchar' })
  platform: string;

  @Column('uuid', { array: true })
  scenarioIds: string[];

  @Column({ type: 'varchar', default: 'single' })
  runMode: string;

  // CRON fields
  @Column({ type: 'varchar', nullable: true })
  cronExpression?: string;

  @Column({ type: 'varchar', nullable: true })
  timezone?: string;

  // AT fields
  @Column({ type: 'timestamp', nullable: true })
  runAt?: Date;

  // AFTER fields
  @Column({ type: 'uuid', nullable: true })
  triggerSourceId?: string;

  @Column({ type: 'varchar', nullable: true })
  triggerOn?: string; // 'done' | 'fail' | 'any'

  @Column({ type: 'int', default: 0 })
  delayMs: number;

  @Column({ type: 'varchar', default: 'run_latest_only' })
  misfirePolicy: MisfirePolicy;

  @Column({ type: 'varchar', default: 'skip' })
  overlapPolicy: OverlapPolicy;

  @Column({ type: 'int', default: 5 })
  lookaheadCount: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', default: {} })
  options: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
