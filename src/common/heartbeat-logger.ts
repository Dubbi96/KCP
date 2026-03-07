import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = process.env.HEARTBEAT_LOG_DIR || path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'heartbeat.log');

let logStream: fs.WriteStream | null = null;

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }
  return logStream;
}

/**
 * Middleware that logs heartbeat requests to a separate file
 * instead of flooding the main console output.
 */
@Injectable()
export class HeartbeatLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args: any[]) {
      const duration = Date.now() - start;
      const nodeToken = (req.headers['x-node-token'] as string)?.slice(-8) || 'unknown';
      const line = `[${new Date().toISOString()}] heartbeat token=...${nodeToken} status=${res.statusCode} ${duration}ms\n`;
      getLogStream().write(line);
      return originalEnd.apply(res, args);
    } as any;

    next();
  }
}
