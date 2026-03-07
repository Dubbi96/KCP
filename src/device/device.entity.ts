import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { NodeEntity } from '../node/node.entity';

export type DeviceStatus = 'available' | 'leased' | 'preparing' | 'offline' | 'error';
export type DevicePlatform = 'ios' | 'android';

@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  nodeId: string;

  @ManyToOne(() => NodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nodeId' })
  node: NodeEntity;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string;

  @Column({ type: 'varchar' })
  platform: DevicePlatform;

  @Column({ type: 'varchar' })
  deviceUdid: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  model: string;

  @Column({ type: 'varchar', nullable: true })
  osVersion: string;

  @Column({ type: 'varchar', default: 'available' })
  status: DeviceStatus;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
