import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity } from './device.entity';
import {
  DeviceHealthEventEntity,
  DeviceFailureEventEntity,
  RecoveryActionEventEntity,
  QuarantineEventEntity,
} from './device-event.entity';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      DeviceHealthEventEntity,
      DeviceFailureEventEntity,
      RecoveryActionEventEntity,
      QuarantineEventEntity,
    ]),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
