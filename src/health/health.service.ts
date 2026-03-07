import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NodeService } from '../node/node.service';

@Injectable()
export class HealthService {
  private readonly timeoutSec: number;

  constructor(
    private readonly nodeService: NodeService,
    config: ConfigService,
  ) {
    this.timeoutSec = config.get<number>('NODE_HEARTBEAT_TIMEOUT_SEC', 90);
  }

  @Interval(15_000)
  async checkNodeHealth() {
    const count = await this.nodeService.markStaleNodesOffline(this.timeoutSec);
    if (count > 0) {
      console.log(`[KCP] Marked ${count} stale node(s) as offline`);
    }
  }
}
