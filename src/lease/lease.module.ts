import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaseEntity } from './lease.entity';
import { LeaseService } from './lease.service';
import { LeaseController } from './lease.controller';
import { SlotModule } from '../slot/slot.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaseEntity]),
    SlotModule,
    DeviceModule,
  ],
  controllers: [LeaseController],
  providers: [LeaseService],
  exports: [LeaseService],
})
export class LeaseModule {}
