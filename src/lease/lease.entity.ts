import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type LeaseResourceType = 'device' | 'slot';
export type LeaseStatus = 'pending' | 'active' | 'released' | 'expired';

@Entity('leases')
export class LeaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  resourceType: LeaseResourceType;

  @Column({ type: 'uuid' })
  resourceId: string;

  @Column({ type: 'uuid' })
  nodeId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  runId: string;

  @Column({ type: 'uuid', nullable: true })
  scenarioRunId: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: LeaseStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  releasedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
