import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleEntity } from './schedule.entity';
import { PlannedRunEntity } from './planned-run.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { RunModule } from '../run/run.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduleEntity, PlannedRunEntity]),
    forwardRef(() => RunModule),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
