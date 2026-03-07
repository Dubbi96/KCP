import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { NodeModule } from './node/node.module';
import { DeviceModule } from './device/device.module';
import { SlotModule } from './slot/slot.module';
import { LeaseModule } from './lease/lease.module';
import { JobModule } from './job/job.module';
import { ResourceModule } from './resource/resource.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    NodeModule,
    DeviceModule,
    SlotModule,
    LeaseModule,
    JobModule,
    ResourceModule,
    HealthModule,
  ],
})
export class AppModule {}
