import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { NodeModule } from '../node/node.module';

@Module({
  imports: [NodeModule],
  providers: [HealthService],
})
export class HealthModule {}
