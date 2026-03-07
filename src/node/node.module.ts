import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeEntity } from './node.entity';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { DeviceModule } from '../device/device.module';
import { SlotModule } from '../slot/slot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NodeEntity]),
    DeviceModule,
    SlotModule,
  ],
  controllers: [NodeController],
  providers: [NodeService],
  exports: [NodeService, TypeOrmModule.forFeature([NodeEntity])],
})
export class NodeModule {}
