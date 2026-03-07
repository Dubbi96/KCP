import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NodeEntity } from '../node/node.entity';

@Injectable()
export class NodeTokenGuard implements CanActivate {
  constructor(
    @InjectRepository(NodeEntity)
    private readonly nodeRepo: Repository<NodeEntity>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // mTLS: if client certificate is present, log the CN for auditing
    const peerCert = (req.socket as any)?.getPeerCertificate?.();
    if (peerCert?.subject?.CN) {
      req.clientCertCN = peerCert.subject.CN;
    }

    const token = req.headers['x-node-token'] as string;
    if (!token) throw new UnauthorizedException('Missing X-Node-Token');

    const node = await this.nodeRepo.findOne({ where: { apiToken: token } });
    if (!node) throw new UnauthorizedException('Invalid node token');

    req.node = node;
    return true;
  }
}
