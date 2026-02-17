/**
 * Trust Score System — Computes a composite trust score for each agent.
 *
 * Factors:
 * 1. Registration age (0-25 points) — longer presence = more trust
 * 2. Connection count (0-25 points) — more connections = more trust
 * 3. Task completions (0-25 points) — successful hires = more trust
 * 4. HCS-19 privacy compliance (0-25 points) — consent = more trust
 *
 * Total: 0-100 scale
 */

export interface TrustFactors {
  registration_age_days: number;
  connection_count: number;
  task_completions: number;
  has_privacy_consent: boolean;
  consent_purposes_count: number;
  reputation_score: number;
}

export interface TrustScoreResult {
  trust_score: number;
  factors: {
    age_score: number;
    connection_score: number;
    task_score: number;
    privacy_score: number;
  };
  level: 'new' | 'basic' | 'trusted' | 'verified' | 'elite';
}

/**
 * Compute the trust score for an agent based on multiple factors.
 */
export function computeTrustScore(factors: TrustFactors): TrustScoreResult {
  // Age score: 0-25 points (max at 30+ days)
  const age_score = Math.min(25, Math.floor((factors.registration_age_days / 30) * 25));

  // Connection score: 0-25 points (max at 10+ connections)
  const connection_score = Math.min(25, Math.floor((factors.connection_count / 10) * 25));

  // Task completion score: 0-25 points (max at 20+ completions)
  const task_score = Math.min(25, Math.floor((factors.task_completions / 20) * 25));

  // Privacy compliance score: 0-25 points
  let privacy_score = 0;
  if (factors.has_privacy_consent) {
    privacy_score += 15; // Base consent bonus
    privacy_score += Math.min(10, factors.consent_purposes_count * 3); // Per-purpose bonus
  }

  const trust_score = age_score + connection_score + task_score + privacy_score;

  return {
    trust_score,
    factors: { age_score, connection_score, task_score, privacy_score },
    level: getTrustLevel(trust_score),
  };
}

/**
 * Map a trust score to a human-readable level.
 */
export function getTrustLevel(score: number): 'new' | 'basic' | 'trusted' | 'verified' | 'elite' {
  if (score >= 80) return 'elite';
  if (score >= 60) return 'verified';
  if (score >= 40) return 'trusted';
  if (score >= 20) return 'basic';
  return 'new';
}

/**
 * TrustScoreTracker — Manages trust score state for all agents.
 */
export class TrustScoreTracker {
  private connectionCounts: Map<string, number> = new Map();
  private taskCompletions: Map<string, number> = new Map();
  private consentStatus: Map<string, { hasConsent: boolean; purposes: number }> = new Map();
  private registrationDates: Map<string, string> = new Map();

  /**
   * Record that an agent was registered at a given time.
   */
  recordRegistration(agentId: string, registeredAt: string): void {
    this.registrationDates.set(agentId, registeredAt);
  }

  /**
   * Record a connection for an agent.
   */
  recordConnection(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, current + 1);
  }

  /**
   * Record a task completion for an agent.
   */
  recordTaskCompletion(agentId: string): void {
    const current = this.taskCompletions.get(agentId) || 0;
    this.taskCompletions.set(agentId, current + 1);
  }

  /**
   * Record consent status for an agent.
   */
  recordConsent(agentId: string, purposes: number): void {
    this.consentStatus.set(agentId, { hasConsent: true, purposes });
  }

  /**
   * Revoke consent for an agent.
   */
  revokeConsent(agentId: string): void {
    this.consentStatus.set(agentId, { hasConsent: false, purposes: 0 });
  }

  /**
   * Get trust score for an agent.
   */
  getTrustScore(agentId: string, reputationScore?: number): TrustScoreResult {
    const registeredAt = this.registrationDates.get(agentId);
    const ageDays = registeredAt
      ? Math.floor((Date.now() - new Date(registeredAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const consent = this.consentStatus.get(agentId) || { hasConsent: false, purposes: 0 };

    return computeTrustScore({
      registration_age_days: ageDays,
      connection_count: this.connectionCounts.get(agentId) || 0,
      task_completions: this.taskCompletions.get(agentId) || 0,
      has_privacy_consent: consent.hasConsent,
      consent_purposes_count: consent.purposes,
      reputation_score: reputationScore || 0,
    });
  }

  /**
   * Get connection count for an agent.
   */
  getConnectionCount(agentId: string): number {
    return this.connectionCounts.get(agentId) || 0;
  }

  /**
   * Get task completion count for an agent.
   */
  getTaskCompletions(agentId: string): number {
    return this.taskCompletions.get(agentId) || 0;
  }

  /**
   * Get all tracked agent IDs.
   */
  getTrackedAgents(): string[] {
    const ids = new Set<string>();
    for (const id of this.registrationDates.keys()) ids.add(id);
    for (const id of this.connectionCounts.keys()) ids.add(id);
    for (const id of this.taskCompletions.keys()) ids.add(id);
    return Array.from(ids);
  }
}
