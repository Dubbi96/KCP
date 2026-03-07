import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { createHmac } from 'crypto';
import { WebhookEntity, WebhookEventEntity } from './webhook.entity';

const RETRY_BACKOFF = [0, 60, 300, 900, 3600]; // seconds

@Injectable()
export class WebhookService {
  private readonly logger = new Logger('WebhookService');

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly whRepo: Repository<WebhookEntity>,
    @InjectRepository(WebhookEventEntity)
    private readonly eventRepo: Repository<WebhookEventEntity>,
  ) {}

  // --- CRUD ---

  async create(data: Partial<WebhookEntity>) {
    return this.whRepo.save(this.whRepo.create(data));
  }

  async findAll(tenantId: string) {
    return this.whRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const wh = await this.whRepo.findOne({ where: { id } });
    if (!wh) throw new NotFoundException('Webhook not found');
    return wh;
  }

  async update(id: string, data: Partial<WebhookEntity>) {
    await this.whRepo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.eventRepo.delete({ webhookId: id });
    await this.whRepo.delete(id);
    return { ok: true };
  }

  async getEvents(webhookId: string, limit = 20) {
    return this.eventRepo.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // --- Event Emission ---

  async emit(tenantId: string, eventType: string, payload: Record<string, any>) {
    if (!tenantId) return;

    const webhooks = await this.whRepo.find({ where: { tenantId, enabled: true } });

    for (const wh of webhooks) {
      if (!this.matchesFilter(eventType, wh.eventsFilter)) continue;

      await this.eventRepo.save(this.eventRepo.create({
        webhookId: wh.id,
        eventType,
        payload: { ...payload, timestamp: new Date().toISOString() },
        nextRetryAt: new Date(),
      }));
    }
  }

  private matchesFilter(eventType: string, filters: string[]): boolean {
    for (const f of filters) {
      if (f === '*') return true;
      if (f.endsWith('.*') && eventType.startsWith(f.slice(0, -1))) return true;
      if (f === eventType) return true;
    }
    return false;
  }

  // --- Dispatcher (5s interval) ---

  @Interval(5_000)
  async dispatchPending() {
    const events = await this.eventRepo.find({
      where: {
        status: 'pending',
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: 10,
      order: { createdAt: 'ASC' },
    });

    for (const event of events) {
      const webhook = await this.whRepo.findOne({ where: { id: event.webhookId } });
      if (!webhook || !webhook.enabled) {
        event.status = 'exhausted';
        await this.eventRepo.save(event);
        continue;
      }

      try {
        const body = JSON.stringify({
          event: event.eventType,
          ...event.payload,
        });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // HMAC signature
        if (webhook.secret) {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const sig = createHmac('sha256', webhook.secret)
            .update(`${timestamp}.${body}`)
            .digest('hex');
          headers['X-Katab-Signature'] = `t=${timestamp},v1=${sig}`;
          headers['X-Katab-Timestamp'] = timestamp;
          headers['X-Katab-Event'] = event.eventType;
        }

        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          event.status = 'delivered';
          event.deliveredAt = new Date();
        } else if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '60');
          event.nextRetryAt = new Date(Date.now() + retryAfter * 1000);
          event.attempt++;
          event.lastError = `429 Too Many Requests`;
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (e: any) {
        event.attempt++;
        event.lastError = e.message;
        if (event.attempt >= event.maxAttempts) {
          event.status = 'exhausted';
        } else {
          const backoff = RETRY_BACKOFF[Math.min(event.attempt, RETRY_BACKOFF.length - 1)];
          event.nextRetryAt = new Date(Date.now() + backoff * 1000);
        }
      }

      await this.eventRepo.save(event);
    }
  }
}
