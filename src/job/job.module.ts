import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobEntity } from './job.entity';
import { JobService } from './job.service';
import { JobController } from './job.controller';
import { NodeModule } from '../node/node.module';
import { SlotModule } from '../slot/slot.module';
import { DeviceModule } from '../device/device.module';
import { LeaseModule } from '../lease/lease.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobEntity]),
    NodeModule,
    SlotModule,
    DeviceModule,
    LeaseModule,
  ],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
