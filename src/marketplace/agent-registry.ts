/**
 * Agent Registry — In-memory + HCS-backed agent registration and lookup.
 *
 * Sprint 1: In-memory store with HCS write-through
 * Sprint 3: Full-text search, category filtering
 */

import { AgentRegistration, RegisteredAgent, SearchQuery, SearchResult } from '../types';
import { HCS10Client } from '../hcs/hcs10-client';
import { HCS11ProfileManager } from '../hcs/hcs11-profile';
import { HCS14IdentityManager } from '../hcs/hcs14-identity';

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private hcs10: HCS10Client;
  private hcs11: HCS11ProfileManager;
  private hcs14: HCS14IdentityManager;

  constructor(hcs10: HCS10Client, hcs11: HCS11ProfileManager, hcs14: HCS14IdentityManager) {
    this.hcs10 = hcs10;
    this.hcs11 = hcs11;
    this.hcs14 = hcs14;
  }

  /**
   * Register a new agent.
   *
   * TODO [Sprint 1]: Wire up real HCS-10 registration + HCS-11 profile + HCS-14 DID
   */
  async register(registration: AgentRegistration): Promise<RegisteredAgent> {
    // Step 1: Register on HCS-10
    const agent = await this.hcs10.registerAgent(registration);

    // Step 2: Create HCS-11 profile
    await this.hcs11.createProfile(agent);

    // Step 3: Create HCS-14 DID
    await this.hcs14.createDID(agent.agent_id, agent.endpoint);

    // Step 4: Store locally
    this.agents.set(agent.agent_id, agent);

    return agent;
  }

  /**
   * Get agent by ID.
   */
  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    return this.agents.get(agentId) || null;
  }

  /**
   * Search agents with optional filters.
   *
   * TODO [Sprint 3]: Full-text search with relevance scoring
   */
  async searchAgents(query: SearchQuery): Promise<SearchResult> {
    let results = Array.from(this.agents.values());

    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.skills.some((s) => s.name.toLowerCase().includes(q) || (s.tags || []).some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (query.category) {
      const cat = query.category.toLowerCase();
      results = results.filter((a) => a.skills.some((s) => s.category?.toLowerCase() === cat));
    }

    if (query.status) {
      results = results.filter((a) => a.status === query.status);
    }

    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    results = results.slice(offset, offset + limit);

    return {
      agents: results,
      total,
      registry_topic: this.hcs10.getConfig().registryTopicId,
    };
  }

  /**
   * List all registered agents.
   */
  async listAgents(): Promise<RegisteredAgent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Update agent status.
   */
  async updateStatus(agentId: string, status: 'online' | 'offline' | 'suspended'): Promise<RegisteredAgent | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.status = status;
    this.agents.set(agentId, agent);
    return agent;
  }

  /**
   * Get total count of registered agents.
   */
  getCount(): number {
    return this.agents.size;
  }
}
