/**
 * HOL Registry Broker Integration
 *
 * Registers the HireWire Agent Marketplace in the HOL Registry Broker
 * for cross-protocol discovery. Uses RegistryBrokerClient from
 * @hashgraphonline/standards-sdk for authentication and registration.
 *
 * Two registration paths:
 * 1. HCS-10 on-chain registration (already done — topics exist)
 * 2. Registry Broker indexed registration (this module)
 *
 * Sprint 17 additions:
 * - searchAgents() — query the broker index with filters
 * - getAgentProfile() — fetch a single agent by ID/UAID
 * - vectorSearch() — semantic vector search via registry-broker-skills API
 * - getSkills() / registerSkill() — Skills Registry listing
 */

import { loadConfig } from '../config';

/** Lazy-load the standards-sdk to avoid ESM issues in CJS/Jest */
async function loadSDK(): Promise<typeof import('@hashgraphonline/standards-sdk')> {
  return import('@hashgraphonline/standards-sdk');
}

export interface RegistryBrokerConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  brokerBaseUrl?: string;
  agentEndpoint?: string;
}

export interface RegistrationProfile {
  display_name: string;
  alias: string;
  bio: string;
  tags: string[];
  socials: Array<{ platform: string; handle: string }>;
  model?: string;
  creator?: string;
  capabilities?: string[];
}

export interface RegistrationResult {
  success: boolean;
  uaid?: string;
  agentId?: string;
  error?: string;
  timestamp: string;
}

export interface RegistryStatus {
  registered: boolean;
  uaid?: string;
  agentId?: string;
  brokerUrl: string;
  lastCheck: string;
  error?: string;
}

export interface AgentSearchQuery {
  q?: string;
  tags?: string[];
  protocol?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface AgentSearchResult {
  agents: BrokerAgentEntry[];
  total: number;
  query: AgentSearchQuery;
  timestamp: string;
}

export interface BrokerAgentEntry {
  uaid?: string;
  agentId?: string;
  display_name: string;
  alias?: string;
  bio?: string;
  tags?: string[];
  protocol?: string;
  endpoint?: string;
  capabilities?: string[];
  score?: number;
}

export interface VectorSearchQuery {
  text: string;
  topK?: number;
  threshold?: number;
  filter?: Record<string, string>;
}

export interface VectorSearchResult {
  results: BrokerAgentEntry[];
  total: number;
  query: string;
  method: 'vector';
  timestamp: string;
}

export interface BrokerSkillEntry {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  agentId?: string;
  version?: string;
  pricing?: { amount: number; token: string; unit: string };
}

export interface SkillsListResult {
  skills: BrokerSkillEntry[];
  total: number;
  timestamp: string;
}

const DEFAULT_BROKER_URL = 'https://hol.org/registry/api/v1';

export class RegistryBroker {
  private config: RegistryBrokerConfig;
  private brokerUrl: string;
  private registrationResult: RegistrationResult | null = null;

  constructor(config: RegistryBrokerConfig) {
    this.config = config;
    this.brokerUrl = config.brokerBaseUrl || DEFAULT_BROKER_URL;
  }

  /**
   * Authenticate with the Registry Broker using Hedera ledger credentials.
   * Returns a RegistryBrokerClient instance ready for operations.
   */
  async authenticate(): Promise<unknown> {
    const sdk = await loadSDK();
    const RegistryBrokerClient = (sdk as Record<string, unknown>).RegistryBrokerClient as new (opts: Record<string, unknown>) => Record<string, unknown>;

    if (!RegistryBrokerClient) {
      throw new Error('RegistryBrokerClient not found in @hashgraphonline/standards-sdk');
    }

    const client = new RegistryBrokerClient({
      baseUrl: this.brokerUrl,
    });

    // Authenticate with Hedera credentials
    const authMethod = (client as Record<string, (...args: unknown[]) => Promise<unknown>>).authenticateWithLedgerCredentials;
    if (typeof authMethod === 'function') {
      await authMethod.call(client, {
        accountId: this.config.accountId,
        network: `hedera:${this.config.network}`,
        privateKey: this.config.privateKey,
        label: 'HireWire Marketplace Agent',
      });
    }

    return client;
  }

  /**
   * Build the agent profile for Registry Broker registration.
   */
  buildProfile(): RegistrationProfile {
    return {
      display_name: 'HireWire Agent Marketplace',
      alias: 'hirewire-marketplace',
      bio: 'Decentralized AI agent marketplace on Hedera with HCS-10 communication, HCS-26 skills registry, and HCS-20 reputation points',
      tags: ['marketplace', 'agents', 'hedera', 'hcs-10', 'hcs-26', 'hcs-20', 'reputation'],
      socials: [
        { platform: 'twitter', handle: '@opspawn' },
        { platform: 'github', handle: 'opspawn' },
      ],
      model: 'claude-opus-4-6',
      creator: 'OpSpawn',
      capabilities: ['agent-discovery', 'agent-hiring', 'skill-publishing', 'reputation-tracking'],
    };
  }

  /**
   * Register the agent with the HOL Registry Broker.
   *
   * This makes the agent discoverable in the universal index
   * across 14+ protocols. Uses HCS-10 as the communication protocol.
   */
  async register(): Promise<RegistrationResult> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const profile = this.buildProfile();

      const endpoint = this.config.agentEndpoint || 'https://hedera.opspawn.com/api/agent';

      const registrationPayload = {
        profile: {
          version: '1.0',
          type: 'ai_agent',
          display_name: profile.display_name,
          alias: profile.alias,
          bio: profile.bio,
          properties: {
            tags: profile.tags,
          },
          socials: profile.socials,
          aiAgent: {
            type: 'autonomous',
            model: profile.model,
            capabilities: profile.capabilities,
            creator: profile.creator,
          },
        },
        communicationProtocol: 'hcs-10',
        registry: 'hashgraph-online',
        endpoint,
        metadata: {
          provider: 'opspawn',
          version: '0.17.0',
          standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
        },
      };

      const registerMethod = client.registerAgent;
      let registration: Record<string, unknown> | undefined;
      if (typeof registerMethod === 'function') {
        registration = await registerMethod.call(client, registrationPayload) as Record<string, unknown>;
      }

      this.registrationResult = {
        success: true,
        uaid: registration?.uaid as string | undefined,
        agentId: registration?.agentId as string | undefined,
        timestamp: new Date().toISOString(),
      };

      return this.registrationResult;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown registration error';
      this.registrationResult = {
        success: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      };
      return this.registrationResult;
    }
  }

  /**
   * Search agents in the Registry Broker index.
   *
   * Uses the SDK client's search method with query parameters for
   * text search, tag filtering, protocol filtering, and pagination.
   */
  async searchAgents(query: AgentSearchQuery): Promise<AgentSearchResult> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const searchMethod = client.search;

      if (typeof searchMethod === 'function') {
        const searchParams: Record<string, unknown> = {};
        if (query.q) searchParams.q = query.q;
        if (query.tags?.length) searchParams.tags = query.tags.join(',');
        if (query.protocol) searchParams.protocol = query.protocol;
        if (query.type) searchParams.type = query.type;
        if (query.limit) searchParams.limit = query.limit;
        if (query.offset) searchParams.offset = query.offset;

        const results = await searchMethod.call(client, searchParams) as Record<string, unknown>;
        const rawAgents = (results?.agents || results?.results || []) as Record<string, unknown>[];

        const agents: BrokerAgentEntry[] = rawAgents.map(a => ({
          uaid: a.uaid as string | undefined,
          agentId: a.agentId as string | undefined,
          display_name: (a.display_name || a.name || 'Unknown') as string,
          alias: a.alias as string | undefined,
          bio: a.bio as string | undefined,
          tags: a.tags as string[] | undefined,
          protocol: a.protocol as string | undefined,
          endpoint: a.endpoint as string | undefined,
          capabilities: a.capabilities as string[] | undefined,
          score: a.score as number | undefined,
        }));

        return {
          agents,
          total: (results?.total as number) || agents.length,
          query,
          timestamp: new Date().toISOString(),
        };
      }

      return { agents: [], total: 0, query, timestamp: new Date().toISOString() };
    } catch (err: unknown) {
      return { agents: [], total: 0, query, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Get a specific agent's profile from the Registry Broker by UAID or agent ID.
   *
   * Tries the SDK client's getAgent method first, then falls back to search.
   */
  async getAgentProfile(agentIdOrUaid: string): Promise<BrokerAgentEntry | null> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;

      // Try direct getAgent method
      const getMethod = client.getAgent;
      if (typeof getMethod === 'function') {
        const result = await getMethod.call(client, agentIdOrUaid) as Record<string, unknown> | null;
        if (result) {
          return {
            uaid: result.uaid as string | undefined,
            agentId: result.agentId as string | undefined,
            display_name: (result.display_name || result.name || 'Unknown') as string,
            alias: result.alias as string | undefined,
            bio: result.bio as string | undefined,
            tags: result.tags as string[] | undefined,
            protocol: result.protocol as string | undefined,
            endpoint: result.endpoint as string | undefined,
            capabilities: result.capabilities as string[] | undefined,
          };
        }
      }

      // Fallback: search by ID
      const searchResult = await this.searchAgents({ q: agentIdOrUaid, limit: 1 });
      return searchResult.agents[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Perform semantic vector search against the Registry Broker.
   *
   * Uses the vectorSearch endpoint (from registry-broker-skills) to find
   * agents by semantic similarity rather than keyword matching. This enables
   * natural language queries like "find me an agent that can summarize documents".
   */
  async vectorSearch(query: VectorSearchQuery): Promise<VectorSearchResult> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;

      // Try SDK vectorSearch method
      const vectorMethod = client.vectorSearch;
      if (typeof vectorMethod === 'function') {
        const results = await vectorMethod.call(client, {
          text: query.text,
          topK: query.topK || 10,
          threshold: query.threshold || 0.5,
          filter: query.filter,
        }) as Record<string, unknown>;

        const rawResults = (results?.results || results?.agents || []) as Record<string, unknown>[];
        const agents: BrokerAgentEntry[] = rawResults.map(a => ({
          uaid: a.uaid as string | undefined,
          agentId: a.agentId as string | undefined,
          display_name: (a.display_name || a.name || 'Unknown') as string,
          alias: a.alias as string | undefined,
          bio: a.bio as string | undefined,
          tags: a.tags as string[] | undefined,
          protocol: a.protocol as string | undefined,
          endpoint: a.endpoint as string | undefined,
          capabilities: a.capabilities as string[] | undefined,
          score: a.score as number | undefined,
        }));

        return {
          results: agents,
          total: (results?.total as number) || agents.length,
          query: query.text,
          method: 'vector',
          timestamp: new Date().toISOString(),
        };
      }

      // Fallback: if vectorSearch not available, use regular search
      const fallback = await this.searchAgents({ q: query.text, limit: query.topK || 10 });
      return {
        results: fallback.agents,
        total: fallback.total,
        query: query.text,
        method: 'vector',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        results: [],
        total: 0,
        query: query.text,
        method: 'vector',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * List skills from the Registry Broker's Skills Registry.
   *
   * Queries the HCS-26 skills index via the broker API to discover
   * available agent skills across the network.
   */
  async getSkills(query?: { category?: string; tags?: string[]; limit?: number }): Promise<SkillsListResult> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;

      const listMethod = client.listSkills || client.getSkills;
      if (typeof listMethod === 'function') {
        const params: Record<string, unknown> = {};
        if (query?.category) params.category = query.category;
        if (query?.tags?.length) params.tags = query.tags.join(',');
        if (query?.limit) params.limit = query.limit;

        const results = await listMethod.call(client, params) as Record<string, unknown>;
        const rawSkills = (results?.skills || results?.results || []) as Record<string, unknown>[];

        const skills: BrokerSkillEntry[] = rawSkills.map(s => ({
          id: (s.id || s.topic_id || '') as string,
          name: (s.name || '') as string,
          description: (s.description || '') as string,
          category: s.category as string | undefined,
          tags: s.tags as string[] | undefined,
          agentId: s.agentId as string | undefined,
          version: s.version as string | undefined,
          pricing: s.pricing as { amount: number; token: string; unit: string } | undefined,
        }));

        return {
          skills,
          total: (results?.total as number) || skills.length,
          timestamp: new Date().toISOString(),
        };
      }

      return { skills: [], total: 0, timestamp: new Date().toISOString() };
    } catch {
      return { skills: [], total: 0, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Register a skill with the Registry Broker's Skills Registry.
   *
   * Publishes a skill definition to the HCS-26 index, making it
   * discoverable by other agents across the network.
   */
  async registerSkill(skill: Omit<BrokerSkillEntry, 'id'>): Promise<BrokerSkillEntry | null> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;

      const registerMethod = client.registerSkill || client.publishSkill;
      if (typeof registerMethod === 'function') {
        const result = await registerMethod.call(client, {
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          agentId: skill.agentId,
          version: skill.version,
          pricing: skill.pricing,
        }) as Record<string, unknown>;

        return {
          id: (result?.id || result?.topic_id || `skill-${Date.now()}`) as string,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          agentId: skill.agentId,
          version: skill.version,
          pricing: skill.pricing,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Verify agent registration by searching the broker index.
   */
  async verifyRegistration(): Promise<boolean> {
    try {
      const client = await this.authenticate() as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const searchMethod = client.search;
      if (typeof searchMethod === 'function') {
        const results = await searchMethod.call(client, { q: 'hirewire-marketplace' }) as Record<string, unknown>;
        const agents = (results?.agents || results?.results || []) as unknown[];
        return agents.length > 0;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get the current registration status.
   */
  getStatus(): RegistryStatus {
    return {
      registered: this.registrationResult?.success ?? false,
      uaid: this.registrationResult?.uaid,
      agentId: this.registrationResult?.agentId,
      brokerUrl: this.brokerUrl,
      lastCheck: this.registrationResult?.timestamp || new Date().toISOString(),
      error: this.registrationResult?.error,
    };
  }

  /**
   * Get the broker URL.
   */
  getBrokerUrl(): string {
    return this.brokerUrl;
  }

  /**
   * Create a RegistryBroker from the app config.
   */
  static fromConfig(): RegistryBroker {
    const config = loadConfig();
    return new RegistryBroker({
      accountId: config.hedera.accountId,
      privateKey: config.hedera.privateKey,
      network: config.hedera.network,
    });
  }
}
