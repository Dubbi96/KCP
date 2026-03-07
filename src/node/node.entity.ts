import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type NodeStatus = 'online' | 'offline' | 'draining' | 'maintenance';

@Entity('nodes')
export class NodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  host: string;

  @Column({ type: 'int' })
  port: number;

  @Column({ type: 'varchar', default: 'offline' })
  status: NodeStatus;

  @Column('text', { array: true, default: '{}' })
  labels: string[];

  @Column('text', { array: true, default: '{}' })
  platforms: string[];

  @Column({ type: 'int', default: 0 })
  cpuCores: number;

  @Column({ type: 'int', default: 0 })
  memoryMb: number;

  @Column({ type: 'int', default: 0 })
  diskGb: number;

  @Column({ type: 'float', default: 0 })
  cpuUsagePercent: number;

  @Column({ type: 'float', default: 0 })
  memoryUsagePercent: number;

  @Column({ type: 'varchar', unique: true })
  apiToken: string;

  @Column({ type: 'varchar', nullable: true })
  version: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastHeartbeatAt: Date;

  @CreateDateColumn()
  registeredAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
