import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunEntity } from './run.entity';
import { ScenarioRunEntity } from './scenario-run.entity';
import { RunService } from './run.service';
import { RunController } from './run.controller';
import { JobModule } from '../job/job.module';
import { NodeModule } from '../node/node.module';
import { WebhookModule } from '../webhook/webhook.module';
import { PauseModule } from '../pause/pause.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RunEntity, ScenarioRunEntity]),
    JobModule,
    NodeModule,
    forwardRef(() => WebhookModule),
    forwardRef(() => PauseModule),
    SignalModule,
  ],
  controllers: [RunController],
  providers: [RunService],
  exports: [RunService],
})
export class RunModule {}
