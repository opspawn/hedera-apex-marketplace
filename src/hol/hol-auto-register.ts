/**
 * HOL Auto-Registration — Registers marketplace agents in the HOL Registry Broker.
 *
 * On startup, checks if our 8 demo agents are registered in HOL.
 * If not, auto-registers them with full profiles.
 *
 * Sprint 37: Built for $8K HOL bounty (Workshop 4, Feb 23).
 */

import { HOLRegistryClient, HOLRegistrationPayload, HOLRegistrationResult, HOLAgent } from './hol-registry-client';
import { RegisteredAgent } from '../types';

export interface HOLRegistrationRecord {
  agentId: string;
  name: string;
  holUaid?: string;
  status: 'registered' | 'pending' | 'failed' | 'skipped';
  registeredAt?: string;
  error?: string;
}

export interface AutoRegistrationResult {
  registered: number;
  skipped: number;
  failed: number;
  records: HOLRegistrationRecord[];
  timestamp: string;
}

export class HOLAutoRegister {
  private client: HOLRegistryClient;
  private records: Map<string, HOLRegistrationRecord> = new Map();
  private stagingUrl: string;

  constructor(client: HOLRegistryClient, stagingUrl?: string) {
    this.client = client;
    this.stagingUrl = stagingUrl || 'https://hedera.opspawn.com';
  }

  /**
   * Check which agents are already registered in HOL by searching for them.
   */
  async checkRegistered(agents: RegisteredAgent[]): Promise<Map<string, HOLAgent | null>> {
    const results = new Map<string, HOLAgent | null>();

    for (const agent of agents) {
      try {
        const searchResult = await this.client.search({
          q: agent.name,
          limit: 5,
        });
        const match = searchResult.agents.find(
          a => a.name === agent.name || a.name === agent.name.toLowerCase()
        );
        results.set(agent.agent_id, match || null);
      } catch {
        results.set(agent.agent_id, null);
      }
    }

    return results;
  }

  /**
   * Build a HOL registration payload from a marketplace agent.
   */
  buildPayload(agent: RegisteredAgent): HOLRegistrationPayload {
    const skillNames = agent.skills?.map(s => s.name) || [];
    const categories = [...new Set(agent.skills?.map(s => s.category).filter(Boolean) || [])];

    return {
      name: agent.name,
      description: agent.description,
      capabilities: skillNames,
      protocols: agent.protocols || ['hcs-10'],
      endpoints: {
        a2a: `${this.stagingUrl}/api/agents/${agent.agent_id}`,
        chat: `${this.stagingUrl}/api/chat/agent/${agent.agent_id}`,
        hire: `${this.stagingUrl}/api/marketplace/hire`,
      },
      profile: {
        type: 'ai_agent',
        version: '1.0',
        display_name: agent.name,
        bio: agent.description,
        aiAgent: {
          type: 'autonomous',
          model: 'claude-opus-4-6',
          capabilities: skillNames,
          creator: 'OpSpawn',
        },
        properties: {
          categories,
          trust_score: agent.trust_score || 0,
          trust_level: agent.trust_level || 'new',
          reputation_score: agent.reputation_score || 0,
          standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
        },
        socials: [
          { platform: 'github', handle: 'opspawn' },
          { platform: 'twitter', handle: '@opspawn' },
        ],
      },
      communicationProtocol: 'hcs-10',
      registry: 'hashgraph-online',
      metadata: {
        provider: 'opspawn-hirewire-marketplace',
        version: '0.43.0',
        marketplace_agent_id: agent.agent_id,
        inbound_topic: agent.inbound_topic,
        outbound_topic: agent.outbound_topic,
      },
    };
  }

  /**
   * Register a single agent in HOL.
   */
  async registerAgent(agent: RegisteredAgent): Promise<HOLRegistrationRecord> {
    const payload = this.buildPayload(agent);

    try {
      const result = await this.client.register(payload);

      const record: HOLRegistrationRecord = {
        agentId: agent.agent_id,
        name: agent.name,
        holUaid: result.uaid,
        status: result.success ? 'registered' : 'failed',
        registeredAt: result.success ? new Date().toISOString() : undefined,
        error: result.error,
      };

      this.records.set(agent.agent_id, record);
      return record;
    } catch (err) {
      const record: HOLRegistrationRecord = {
        agentId: agent.agent_id,
        name: agent.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      this.records.set(agent.agent_id, record);
      return record;
    }
  }

  /**
   * Auto-register all marketplace agents in HOL.
   * Checks for existing registrations first to avoid duplicates.
   */
  async autoRegisterAll(agents: RegisteredAgent[]): Promise<AutoRegistrationResult> {
    const existing = await this.checkRegistered(agents);
    const records: HOLRegistrationRecord[] = [];
    let registered = 0;
    let skipped = 0;
    let failed = 0;

    for (const agent of agents) {
      const holAgent = existing.get(agent.agent_id);

      if (holAgent) {
        // Already registered — skip
        const record: HOLRegistrationRecord = {
          agentId: agent.agent_id,
          name: agent.name,
          holUaid: holAgent.uaid,
          status: 'skipped',
          registeredAt: new Date().toISOString(),
        };
        records.push(record);
        this.records.set(agent.agent_id, record);
        skipped++;
        continue;
      }

      const record = await this.registerAgent(agent);
      records.push(record);

      if (record.status === 'registered') {
        registered++;
      } else {
        failed++;
      }
    }

    return {
      registered,
      skipped,
      failed,
      records,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all registration records.
   */
  getRecords(): HOLRegistrationRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get a registration record by agent ID.
   */
  getRecord(agentId: string): HOLRegistrationRecord | undefined {
    return this.records.get(agentId);
  }

  /**
   * Get summary of registration status.
   */
  getSummary(): { total: number; registered: number; failed: number; skipped: number } {
    const records = this.getRecords();
    return {
      total: records.length,
      registered: records.filter(r => r.status === 'registered').length,
      failed: records.filter(r => r.status === 'failed').length,
      skipped: records.filter(r => r.status === 'skipped').length,
    };
  }
}
