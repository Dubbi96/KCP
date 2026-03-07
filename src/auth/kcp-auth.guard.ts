import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/**
 * KCP API Guard: accepts either a service token (KCD -> KCP) or JWT Bearer.
 * In development mode (no KCP_SERVICE_TOKEN set), allows all requests.
 */
@Injectable()
export class KcpAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const expectedServiceToken = this.config.get('KCP_SERVICE_TOKEN', '');

    // 1. Service token (KCD -> KCP internal calls)
    const serviceToken = req.headers['x-service-token'] as string;
    if (expectedServiceToken && serviceToken === expectedServiceToken) {
      return true;
    }

    // 2. JWT Bearer (direct access or forwarded from KCD)
    const auth = req.headers['authorization'] as string;
    if (auth?.startsWith('Bearer ')) {
      try {
        const secret = this.config.get('JWT_SECRET', 'dev-secret');
        req.user = jwt.verify(auth.slice(7), secret) as any;
        return true;
      } catch {
        // Fall through to dev mode check
      }
    }

    // 3. Dev mode: no KCP_SERVICE_TOKEN configured = allow all
    if (!expectedServiceToken) return true;

    throw new UnauthorizedException('Authentication required');
  }
}

/**
 * Node Join Token Guard: validates a pre-shared join token for node registration.
 * In development mode (no NODE_JOIN_TOKEN set), allows all registrations.
 */
@Injectable()
export class NodeJoinTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const expected = this.config.get('NODE_JOIN_TOKEN', '');

    // Dev mode: no join token configured = allow all registrations
    if (!expected) return true;

    const token = req.headers['x-join-token'] as string
      || req.body?.joinToken;

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing join token');
    }
    return true;
  }
}
