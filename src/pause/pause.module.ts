import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenarioRunEntity } from '../run/scenario-run.entity';
import { RunEntity } from '../run/run.entity';
import { PauseService } from './pause.service';
import { JobModule } from '../job/job.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScenarioRunEntity, RunEntity]),
    forwardRef(() => JobModule),
  ],
  providers: [PauseService],
  exports: [PauseService],
})
export class PauseModule {}
