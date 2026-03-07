import { Module } from '@nestjs/common';
import { ResourceService } from './resource.service';
import { ResourceController } from './resource.controller';
import { NodeModule } from '../node/node.module';
import { DeviceModule } from '../device/device.module';
import { SlotModule } from '../slot/slot.module';
import { LeaseModule } from '../lease/lease.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [NodeModule, DeviceModule, SlotModule, LeaseModule, JobModule],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
