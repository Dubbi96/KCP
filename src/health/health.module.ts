import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthService } from './health.service';
import { NodeModule } from '../node/node.module';
import { JobEntity } from '../job/job.entity';
import { LeaseEntity } from '../lease/lease.entity';
import { SlotModule } from '../slot/slot.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobEntity, LeaseEntity]),
    NodeModule,
    SlotModule,
    DeviceModule,
  ],
  providers: [HealthService],
})
export class HealthModule {}
