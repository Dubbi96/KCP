import {
  Controller, Post, Get, Delete, Put, Body, Param, Req,
  UseGuards, HttpCode,
} from '@nestjs/common';
import { NodeService } from './node.service';
import { RegisterNodeDto, HeartbeatDto } from './dto/register-node.dto';
import { NodeTokenGuard } from '../auth/node-token.guard';

@Controller('nodes')
export class NodeController {
  constructor(private readonly service: NodeService) {}

  @Post('register')
  async register(@Body() dto: RegisterNodeDto) {
    return this.service.register(dto);
  }

  @Post('heartbeat')
  @UseGuards(NodeTokenGuard)
  @HttpCode(200)
  async heartbeat(@Req() req, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat(req.node.id, dto);
  }

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id/status')
  async setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.setStatus(id, status as any);
  }

  @Post(':id/drain')
  @HttpCode(200)
  async drain(@Param('id') id: string) {
    return this.service.drain(id);
  }

  @Delete(':id')
  async unregister(@Param('id') id: string) {
    return this.service.unregister(id);
  }
}
