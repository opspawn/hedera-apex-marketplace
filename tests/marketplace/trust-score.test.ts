/**
 * Tests for the Trust Score System.
 * Sprint 29 — trust_score computation and TrustScoreTracker.
 */

import { computeTrustScore, getTrustLevel, TrustScoreTracker, TrustFactors } from '../../src/marketplace/trust-score';

describe('computeTrustScore', () => {
  it('returns 0 for a brand new agent with no activity', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.trust_score).toBe(0);
    expect(result.level).toBe('new');
  });

  it('caps age score at 25 for agents older than 30 days', () => {
    const result = computeTrustScore({
      registration_age_days: 60,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.age_score).toBe(25);
  });

  it('scales age score proportionally for agents under 30 days', () => {
    const result = computeTrustScore({
      registration_age_days: 15,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.age_score).toBe(12);
  });

  it('caps connection score at 25 for 10+ connections', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 15,
      task_completions: 0,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.connection_score).toBe(25);
  });

  it('scales connection score proportionally', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 5,
      task_completions: 0,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.connection_score).toBe(12);
  });

  it('caps task score at 25 for 20+ completions', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 30,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.task_score).toBe(25);
  });

  it('scales task score proportionally', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 10,
      has_privacy_consent: false,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.task_score).toBe(12);
  });

  it('gives 15 base points for having privacy consent', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: true,
      consent_purposes_count: 0,
      reputation_score: 0,
    });
    expect(result.factors.privacy_score).toBe(15);
  });

  it('adds per-purpose bonus capped at 10', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: true,
      consent_purposes_count: 3,
      reputation_score: 0,
    });
    expect(result.factors.privacy_score).toBe(24); // 15 + min(10, 9)
  });

  it('caps per-purpose bonus at 10', () => {
    const result = computeTrustScore({
      registration_age_days: 0,
      connection_count: 0,
      task_completions: 0,
      has_privacy_consent: true,
      consent_purposes_count: 10,
      reputation_score: 0,
    });
    expect(result.factors.privacy_score).toBe(25); // 15 + 10 max
  });

  it('returns maximum score of 100 for fully active agent', () => {
    const result = computeTrustScore({
      registration_age_days: 60,
      connection_count: 20,
      task_completions: 30,
      has_privacy_consent: true,
      consent_purposes_count: 5,
      reputation_score: 100,
    });
    expect(result.trust_score).toBe(100);
    expect(result.level).toBe('elite');
  });

  it('sums all factor scores correctly', () => {
    const result = computeTrustScore({
      registration_age_days: 15,
      connection_count: 5,
      task_completions: 10,
      has_privacy_consent: true,
      consent_purposes_count: 2,
      reputation_score: 50,
    });
    // age: 12, conn: 12, task: 12, privacy: 15+6=21
    expect(result.trust_score).toBe(12 + 12 + 12 + 21);
    expect(result.trust_score).toBe(57);
  });
});

describe('getTrustLevel', () => {
  it('returns "new" for score < 20', () => {
    expect(getTrustLevel(0)).toBe('new');
    expect(getTrustLevel(10)).toBe('new');
    expect(getTrustLevel(19)).toBe('new');
  });

  it('returns "basic" for score 20-39', () => {
    expect(getTrustLevel(20)).toBe('basic');
    expect(getTrustLevel(30)).toBe('basic');
    expect(getTrustLevel(39)).toBe('basic');
  });

  it('returns "trusted" for score 40-59', () => {
    expect(getTrustLevel(40)).toBe('trusted');
    expect(getTrustLevel(50)).toBe('trusted');
    expect(getTrustLevel(59)).toBe('trusted');
  });

  it('returns "verified" for score 60-79', () => {
    expect(getTrustLevel(60)).toBe('verified');
    expect(getTrustLevel(70)).toBe('verified');
    expect(getTrustLevel(79)).toBe('verified');
  });

  it('returns "elite" for score 80+', () => {
    expect(getTrustLevel(80)).toBe('elite');
    expect(getTrustLevel(90)).toBe('elite');
    expect(getTrustLevel(100)).toBe('elite');
  });
});

describe('TrustScoreTracker', () => {
  let tracker: TrustScoreTracker;

  beforeEach(() => {
    tracker = new TrustScoreTracker();
  });

  it('returns zero trust score for unknown agent', () => {
    const result = tracker.getTrustScore('unknown-agent');
    expect(result.trust_score).toBe(0);
    expect(result.level).toBe('new');
  });

  it('tracks registration dates', () => {
    // Register agent 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    tracker.recordRegistration('agent-1', thirtyDaysAgo);
    const result = tracker.getTrustScore('agent-1');
    expect(result.factors.age_score).toBe(25);
  });

  it('tracks connections', () => {
    tracker.recordConnection('agent-1');
    tracker.recordConnection('agent-1');
    tracker.recordConnection('agent-1');
    expect(tracker.getConnectionCount('agent-1')).toBe(3);
    const result = tracker.getTrustScore('agent-1');
    expect(result.factors.connection_score).toBeGreaterThan(0);
  });

  it('tracks task completions', () => {
    tracker.recordTaskCompletion('agent-1');
    tracker.recordTaskCompletion('agent-1');
    expect(tracker.getTaskCompletions('agent-1')).toBe(2);
    const result = tracker.getTrustScore('agent-1');
    expect(result.factors.task_score).toBeGreaterThan(0);
  });

  it('tracks consent status', () => {
    tracker.recordConsent('agent-1', 3);
    const result = tracker.getTrustScore('agent-1');
    expect(result.factors.privacy_score).toBeGreaterThan(0);
  });

  it('handles consent revocation', () => {
    tracker.recordConsent('agent-1', 3);
    tracker.revokeConsent('agent-1');
    const result = tracker.getTrustScore('agent-1');
    expect(result.factors.privacy_score).toBe(0);
  });

  it('tracks all agents with getTrackedAgents', () => {
    tracker.recordRegistration('agent-1', new Date().toISOString());
    tracker.recordConnection('agent-2');
    tracker.recordTaskCompletion('agent-3');
    const agents = tracker.getTrackedAgents();
    expect(agents).toContain('agent-1');
    expect(agents).toContain('agent-2');
    expect(agents).toContain('agent-3');
    expect(agents.length).toBe(3);
  });

  it('returns 0 for connection count of unknown agent', () => {
    expect(tracker.getConnectionCount('nope')).toBe(0);
  });

  it('returns 0 for task completions of unknown agent', () => {
    expect(tracker.getTaskCompletions('nope')).toBe(0);
  });

  it('accepts optional reputation score parameter', () => {
    tracker.recordRegistration('agent-1', new Date().toISOString());
    const result = tracker.getTrustScore('agent-1', 95);
    expect(result).toBeDefined();
    expect(result.trust_score).toBeGreaterThanOrEqual(0);
  });

  it('computes cumulative trust score from multiple factors', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    tracker.recordRegistration('agent-1', thirtyDaysAgo);
    for (let i = 0; i < 10; i++) tracker.recordConnection('agent-1');
    for (let i = 0; i < 20; i++) tracker.recordTaskCompletion('agent-1');
    tracker.recordConsent('agent-1', 4);
    const result = tracker.getTrustScore('agent-1', 90);
    expect(result.trust_score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe('elite');
  });
});
