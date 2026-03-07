import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlotEntity } from './slot.entity';
import { SlotService } from './slot.service';

@Module({
  imports: [TypeOrmModule.forFeature([SlotEntity])],
  providers: [SlotService],
  exports: [SlotService],
})
export class SlotModule {}
