import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration — captures all KCP tables as of 2026-03-10.
 * This migration is idempotent: uses IF NOT EXISTS for all creates.
 */
export class InitialSchema1741564800000 implements MigrationInterface {
  name = 'InitialSchema1741564800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── nodes ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "host" varchar NOT NULL,
        "port" int NOT NULL,
        "status" varchar NOT NULL DEFAULT 'offline',
        "labels" text[] NOT NULL DEFAULT '{}',
        "platforms" text[] NOT NULL DEFAULT '{}',
        "cpuCores" int NOT NULL DEFAULT 0,
        "memoryMb" int NOT NULL DEFAULT 0,
        "diskGb" int NOT NULL DEFAULT 0,
        "cpuUsagePercent" float NOT NULL DEFAULT 0,
        "memoryUsagePercent" float NOT NULL DEFAULT 0,
        "apiToken" varchar NOT NULL,
        "version" varchar,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "lastHeartbeatAt" timestamp,
        "registeredAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_nodes_apiToken" UNIQUE ("apiToken")
      )
    `);

    // ── devices ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nodeId" uuid NOT NULL,
        "tenantId" uuid,
        "platform" varchar NOT NULL,
        "deviceUdid" varchar NOT NULL,
        "name" varchar NOT NULL,
        "model" varchar,
        "osVersion" varchar,
        "status" varchar NOT NULL DEFAULT 'available',
        "healthStatus" varchar NOT NULL DEFAULT 'unknown',
        "lastFailureCode" varchar,
        "failureCount" int NOT NULL DEFAULT 0,
        "consecutiveFailures" int NOT NULL DEFAULT 0,
        "quarantineUntil" timestamp,
        "lastHealthCheckAt" timestamp,
        "lastRecoveryAction" varchar,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "lastSeenAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_devices_nodeId" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE
      )
    `);

    // ── slots ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nodeId" uuid NOT NULL,
        "platform" varchar NOT NULL,
        "engine" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'available',
        "concurrencyWeight" int NOT NULL DEFAULT 1,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_slots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_slots_nodeId" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE
      )
    `);

    // ── leases ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "resourceType" varchar NOT NULL,
        "resourceId" uuid NOT NULL,
        "nodeId" uuid NOT NULL,
        "tenantId" uuid NOT NULL,
        "userId" uuid,
        "runId" uuid,
        "scenarioRunId" uuid,
        "status" varchar NOT NULL DEFAULT 'pending',
        "expiresAt" timestamp NOT NULL,
        "releasedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leases" PRIMARY KEY ("id")
      )
    `);

    // ── jobs ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "runId" uuid,
        "scenarioRunId" uuid,
        "scenarioId" uuid,
        "platform" varchar NOT NULL,
        "requiredLabels" text[] NOT NULL DEFAULT '{}',
        "requiredDeviceId" uuid,
        "assignedNodeId" uuid,
        "assignedSlotId" uuid,
        "assignedDeviceId" uuid,
        "status" varchar NOT NULL DEFAULT 'pending',
        "priority" int NOT NULL DEFAULT 0,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "result" jsonb,
        "attempt" int NOT NULL DEFAULT 0,
        "maxAttempts" int NOT NULL DEFAULT 3,
        "startedAt" timestamp,
        "completedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jobs" PRIMARY KEY ("id")
      )
    `);

    // ── runs ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "mode" varchar NOT NULL DEFAULT 'single',
        "platform" varchar NOT NULL,
        "scenarioIds" uuid[] NOT NULL DEFAULT '{}',
        "status" varchar NOT NULL DEFAULT 'pending',
        "concurrency" int NOT NULL DEFAULT 1,
        "totalScenarios" int NOT NULL DEFAULT 0,
        "passedCount" int NOT NULL DEFAULT 0,
        "failedCount" int NOT NULL DEFAULT 0,
        "skippedCount" int NOT NULL DEFAULT 0,
        "scheduleId" uuid,
        "streamId" uuid,
        "options" jsonb NOT NULL DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "startedAt" timestamp,
        "completedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_runs" PRIMARY KEY ("id")
      )
    `);

    // ── scenario_runs ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scenario_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runId" uuid NOT NULL,
        "scenarioId" uuid NOT NULL,
        "sequenceNo" int NOT NULL DEFAULT 0,
        "status" varchar NOT NULL DEFAULT 'queued',
        "attempt" int NOT NULL DEFAULT 0,
        "maxAttempts" int NOT NULL DEFAULT 3,
        "durationMs" int,
        "error" varchar,
        "result" jsonb,
        "signals" jsonb,
        "assignedNodeId" uuid,
        "jobId" uuid,
        "startedAt" timestamp,
        "completedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scenario_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_scenario_runs_runId" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE
      )
    `);

    // ── schedules ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schedules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "type" varchar NOT NULL,
        "platform" varchar NOT NULL,
        "scenarioIds" uuid[] NOT NULL,
        "runMode" varchar NOT NULL DEFAULT 'single',
        "cronExpression" varchar,
        "timezone" varchar,
        "runAt" timestamp,
        "triggerSourceId" uuid,
        "triggerOn" varchar,
        "delayMs" int NOT NULL DEFAULT 0,
        "misfirePolicy" varchar NOT NULL DEFAULT 'run_latest_only',
        "overlapPolicy" varchar NOT NULL DEFAULT 'skip',
        "lookaheadCount" int NOT NULL DEFAULT 5,
        "enabled" boolean NOT NULL DEFAULT true,
        "options" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schedules" PRIMARY KEY ("id")
      )
    `);

    // ── planned_runs ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "planned_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "scheduleId" uuid NOT NULL,
        "scheduledAt" timestamp NOT NULL,
        "status" varchar NOT NULL DEFAULT 'planned',
        "runId" uuid,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_planned_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_planned_runs_scheduleId" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE
      )
    `);

    // ── webhooks ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "url" varchar NOT NULL,
        "secret" varchar,
        "eventsFilter" text[] NOT NULL DEFAULT '{"*"}',
        "type" varchar NOT NULL DEFAULT 'generic',
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhooks" PRIMARY KEY ("id")
      )
    `);

    // ── webhook_events ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "webhookId" uuid NOT NULL,
        "eventType" varchar NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "attempt" int NOT NULL DEFAULT 0,
        "maxAttempts" int NOT NULL DEFAULT 5,
        "nextRetryAt" timestamp,
        "lastError" varchar,
        "deliveredAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id")
      )
    `);

    // ── device_health_events (Phase B) ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_health_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deviceId" varchar NOT NULL,
        "previousStatus" varchar NOT NULL,
        "newStatus" varchar NOT NULL,
        "nodeId" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_health_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dhe_deviceId" ON "device_health_events" ("deviceId")`);

    // ── device_failure_events (Phase B) ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_failure_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deviceId" varchar NOT NULL,
        "failureCode" varchar NOT NULL,
        "failureCategory" varchar,
        "jobId" varchar,
        "nodeId" varchar,
        "consecutiveCount" int NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_failure_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dfe_deviceId" ON "device_failure_events" ("deviceId")`);

    // ── recovery_action_events (Phase B) ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recovery_action_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deviceId" varchar NOT NULL,
        "action" varchar NOT NULL,
        "failureCode" varchar NOT NULL,
        "success" boolean NOT NULL,
        "durationMs" int NOT NULL DEFAULT 0,
        "errorMessage" varchar,
        "nodeId" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recovery_action_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_rae_deviceId" ON "recovery_action_events" ("deviceId")`);

    // ── quarantine_events (Phase B) ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quarantine_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deviceId" varchar NOT NULL,
        "action" varchar NOT NULL,
        "reason" varchar,
        "durationMinutes" int,
        "triggeredBy" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quarantine_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_qe_deviceId" ON "quarantine_events" ("deviceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "quarantine_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recovery_action_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_failure_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_health_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "planned_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scenario_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nodes"`);
  }
}
