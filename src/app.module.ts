import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HeartbeatLoggerMiddleware } from './common/heartbeat-logger';
import { DatabaseModule } from './database/database.module';
import { NodeModule } from './node/node.module';
import { DeviceModule } from './device/device.module';
import { SlotModule } from './slot/slot.module';
import { LeaseModule } from './lease/lease.module';
import { JobModule } from './job/job.module';
import { ResourceModule } from './resource/resource.module';
import { HealthModule } from './health/health.module';
import { RunModule } from './run/run.module';
import { ScheduleModule as KatabScheduleModule } from './schedule/schedule.module';
import { WebhookModule } from './webhook/webhook.module';
import { SignalModule } from './signal/signal.module';
import { PauseModule } from './pause/pause.module';
import { DashboardModule } from './dashboard/dashboard.module';

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
    RunModule,
    KatabScheduleModule,
    WebhookModule,
    SignalModule,
    PauseModule,
    DashboardModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HeartbeatLoggerMiddleware).forRoutes('nodes/heartbeat');
  }
}
