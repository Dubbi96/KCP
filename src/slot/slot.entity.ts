import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { NodeEntity } from '../node/node.entity';

export type SlotStatus = 'available' | 'busy' | 'offline';
export type SlotPlatform = 'web' | 'ios' | 'android';
export type SlotEngine = 'playwright' | 'appium-ios' | 'appium-android';

@Entity('slots')
export class SlotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  nodeId: string;

  @ManyToOne(() => NodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nodeId' })
  node: NodeEntity;

  @Column({ type: 'varchar' })
  platform: SlotPlatform;

  @Column({ type: 'varchar' })
  engine: SlotEngine;

  @Column({ type: 'varchar', default: 'available' })
  status: SlotStatus;

  @Column({ type: 'int', default: 1 })
  concurrencyWeight: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
