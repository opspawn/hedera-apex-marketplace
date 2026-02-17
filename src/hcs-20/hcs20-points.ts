/**
 * HCS-20: Auditable Reputation Points for Agents
 *
 * Tracks reputation points for agents on the marketplace. Points are awarded
 * for task completions, skill endorsements, reliability, and privacy compliance.
 * Each point award is logged as an auditable event that can be published to
 * an HCS topic for on-chain transparency.
 *
 * Point categories:
 * - task_completion: Agent completed a hire task successfully
 * - skill_endorsement: Another agent endorsed a skill
 * - reliability: Uptime and responsiveness bonus
 * - privacy_consent_granted: Agent granted privacy consent (HCS-19)
 * - skill_published: Agent published a skill to HCS-26 registry
 * - initial_registration: Base points for registering
 */

import { v4 as uuidv4 } from 'uuid';

export interface PointAward {
  agentId: string;
  points: number;
  reason: string;
  fromAgent?: string;
}

export interface PointEntry {
  id: string;
  agent_id: string;
  points: number;
  reason: string;
  from_agent: string;
  timestamp: string;
  topic_id?: string;
  sequence_number?: number;
}

export interface AgentPointsSummary {
  agent_id: string;
  total_points: number;
  entries: PointEntry[];
  breakdown: Record<string, number>;
  last_updated: string;
}

export interface HCS20Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  pointsTopicId?: string;
}

export class HCS20PointsTracker {
  private config: HCS20Config;
  /** agentId -> list of point entries */
  private ledger: Map<string, PointEntry[]> = new Map();
  /** agentId -> total points (cached) */
  private totals: Map<string, number> = new Map();

  constructor(config: HCS20Config) {
    this.config = config;
  }

  /**
   * Award points to an agent.
   *
   * Creates an auditable point entry and updates the running total.
   * In production, this would also submit the entry to an HCS topic.
   */
  async awardPoints(award: PointAward): Promise<PointEntry> {
    if (!award.agentId) {
      throw new Error('agentId is required');
    }
    if (award.points <= 0) {
      throw new Error('Points must be positive');
    }
    if (!award.reason) {
      throw new Error('Reason is required');
    }

    const entry: PointEntry = {
      id: uuidv4(),
      agent_id: award.agentId,
      points: award.points,
      reason: award.reason,
      from_agent: award.fromAgent || 'system',
      timestamp: new Date().toISOString(),
    };

    // Append to ledger
    const existing = this.ledger.get(award.agentId) || [];
    existing.push(entry);
    this.ledger.set(award.agentId, existing);

    // Update total
    const currentTotal = this.totals.get(award.agentId) || 0;
    this.totals.set(award.agentId, currentTotal + award.points);

    return entry;
  }

  /**
   * Get total points for an agent.
   */
  getAgentPoints(agentId: string): number {
    return this.totals.get(agentId) || 0;
  }

  /**
   * Get the full point summary for an agent, including breakdown by reason.
   */
  getAgentSummary(agentId: string): AgentPointsSummary {
    const entries = this.ledger.get(agentId) || [];
    const total = this.totals.get(agentId) || 0;

    // Build breakdown by reason category
    const breakdown: Record<string, number> = {};
    for (const entry of entries) {
      const category = entry.reason.split(':')[0]; // e.g. "skill_published:Translation" -> "skill_published"
      breakdown[category] = (breakdown[category] || 0) + entry.points;
    }

    return {
      agent_id: agentId,
      total_points: total,
      entries,
      breakdown,
      last_updated: entries.length > 0 ? entries[entries.length - 1].timestamp : new Date().toISOString(),
    };
  }

  /**
   * Get the point history (entries) for an agent.
   */
  getPointHistory(agentId: string): PointEntry[] {
    return this.ledger.get(agentId) || [];
  }

  /**
   * Get a leaderboard of top agents by points.
   */
  getLeaderboard(limit: number = 10): Array<{ agent_id: string; total_points: number }> {
    const entries = Array.from(this.totals.entries())
      .map(([agent_id, total_points]) => ({ agent_id, total_points }))
      .sort((a, b) => b.total_points - a.total_points);
    return entries.slice(0, limit);
  }

  /**
   * Get the count of agents that have any points.
   */
  getAgentCount(): number {
    return this.ledger.size;
  }

  /**
   * Get the total points awarded across all agents.
   */
  getTotalPointsAwarded(): number {
    let total = 0;
    for (const t of this.totals.values()) {
      total += t;
    }
    return total;
  }

  /**
   * Get the configuration.
   */
  getConfig(): HCS20Config {
    return { ...this.config };
  }
}
