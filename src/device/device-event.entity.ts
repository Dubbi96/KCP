import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// ── Device Health Change Event ───────────────────────────────────────────────

@Entity('device_health_events')
export class DeviceHealthEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column({ type: 'varchar' })
  previousStatus: string;

  @Column({ type: 'varchar' })
  newStatus: string;

  @Column({ type: 'varchar', nullable: true })
  nodeId: string;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Device Failure Event ─────────────────────────────────────────────────────

@Entity('device_failure_events')
export class DeviceFailureEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column({ type: 'varchar' })
  failureCode: string;

  @Column({ type: 'varchar', nullable: true })
  failureCategory: string;

  @Column({ type: 'varchar', nullable: true })
  jobId: string;

  @Column({ type: 'varchar', nullable: true })
  nodeId: string;

  @Column({ type: 'int', default: 0 })
  consecutiveCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Recovery Action Event ────────────────────────────────────────────────────

@Entity('recovery_action_events')
export class RecoveryActionEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  failureCode: string;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'varchar', nullable: true })
  errorMessage: string;

  @Column({ type: 'varchar', nullable: true })
  nodeId: string;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Quarantine Event ─────────────────────────────────────────────────────────

@Entity('quarantine_events')
export class QuarantineEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deviceId: string;

  @Column({ type: 'varchar' })
  action: string;  // 'quarantine' | 'release'

  @Column({ type: 'varchar', nullable: true })
  reason: string;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number;

  @Column({ type: 'varchar', nullable: true })
  triggeredBy: string;  // 'auto' | 'manual' | 'expiry'

  @CreateDateColumn()
  createdAt: Date;
}
