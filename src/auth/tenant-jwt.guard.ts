import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TenantJwtGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string;
    if (!auth?.startsWith('Bearer '))
      throw new UnauthorizedException('Missing Bearer token');

    try {
      const secret = this.config.get('JWT_SECRET', 'dev-secret');
      req.user = jwt.verify(auth.slice(7), secret) as any;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
