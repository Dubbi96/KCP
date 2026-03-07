import { Injectable, Logger } from '@nestjs/common';

/**
 * Outcome Classification & Retry Policy Engine
 *
 * Classifies test outcomes from signals collected during execution,
 * and determines whether a failed scenario should be retried.
 */

export type OutcomeClass = 'pass' | 'flaky_pass' | 'retryable_fail' | 'fail' | 'infra_fail';

interface Signal {
  coordinateFallbackCount?: number;
  forceClickCount?: number;
  healedLocatorCount?: number;
  softFallbackCount?: number;
  optionalAssertionSuccessRate?: number;
  errorMessage?: string;
  status?: string;
  platform?: string;
}

interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  delaySec: number;
  maxAttempts: number;
}

const RETRYABLE_PATTERNS = [
  /timeout/i, /waiting for selector/i, /element not found/i,
  /session not created/i, /stale element/i, /no such element/i,
  /waiting for locator/i, /navigation timeout/i,
];

const INFRA_PATTERNS = [
  /econnrefused/i, /econnreset/i, /epipe/i, /socket hang up/i,
  /appium.*not reachable/i, /could not create session/i,
  /device not found/i, /adb.*error/i, /xcodebuild.*failed/i,
  /browser.*closed/i, /browser.*crashed/i,
];

@Injectable()
export class SignalService {
  private readonly logger = new Logger('SignalService');

  classifyOutcome(signal: Signal): OutcomeClass {
    const { status, errorMessage } = signal;

    if (status === 'passed' || status === 'pass') {
      // Check for flakiness indicators
      const coordFallback = signal.coordinateFallbackCount || 0;
      const forceClick = signal.forceClickCount || 0;
      const softFallback = signal.softFallbackCount || 0;
      const optRate = signal.optionalAssertionSuccessRate;

      if (coordFallback > 0 || forceClick > 0 || softFallback > 3) {
        return 'flaky_pass';
      }
      if (optRate !== undefined && optRate <= 0.2) {
        return 'flaky_pass';
      }
      return 'pass';
    }

    if (errorMessage) {
      if (INFRA_PATTERNS.some((p) => p.test(errorMessage))) return 'infra_fail';
      if (RETRYABLE_PATTERNS.some((p) => p.test(errorMessage))) return 'retryable_fail';
    }

    if (status === 'infra_failed') return 'infra_fail';
    if (status === 'skipped') return 'fail';

    return 'fail';
  }

  getRetryDecision(signal: Signal, attempt: number): RetryDecision {
    const outcome = this.classifyOutcome(signal);
    const platform = signal.platform || 'web';

    // Mobile infra failures get more retries
    if (outcome === 'infra_fail' && (platform === 'ios' || platform === 'android')) {
      const delays = [0, 60, 180];
      if (attempt < 3) {
        return {
          shouldRetry: true,
          reason: 'mobile_infra_retry',
          delaySec: delays[attempt] || 180,
          maxAttempts: 3,
        };
      }
    }

    // Generic infra retry
    if (outcome === 'infra_fail') {
      const delays = [0, 30, 120];
      if (attempt < 3) {
        return {
          shouldRetry: true,
          reason: 'infra_retry',
          delaySec: delays[attempt] || 120,
          maxAttempts: 3,
        };
      }
    }

    // Retryable failures (selector/timing issues)
    if (outcome === 'retryable_fail') {
      if (attempt < 2) {
        return {
          shouldRetry: true,
          reason: 'retryable_fail',
          delaySec: attempt === 0 ? 0 : 30,
          maxAttempts: 2,
        };
      }
    }

    return { shouldRetry: false, reason: 'no_retry', delaySec: 0, maxAttempts: 0 };
  }

  analyzeSignals(signals: Signal[]): {
    totalRuns: number;
    outcomes: Record<OutcomeClass, number>;
    retryRate: number;
    infraFailRate: number;
    flakyRate: number;
  } {
    const outcomes: Record<OutcomeClass, number> = {
      pass: 0, flaky_pass: 0, retryable_fail: 0, fail: 0, infra_fail: 0,
    };

    for (const s of signals) {
      const cls = this.classifyOutcome(s);
      outcomes[cls]++;
    }

    const total = signals.length || 1;
    return {
      totalRuns: signals.length,
      outcomes,
      retryRate: (outcomes.retryable_fail + outcomes.infra_fail) / total,
      infraFailRate: outcomes.infra_fail / total,
      flakyRate: outcomes.flaky_pass / total,
    };
  }
}
