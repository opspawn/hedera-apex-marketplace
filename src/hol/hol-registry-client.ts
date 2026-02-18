/**
 * HOL Registry Client — Direct REST API client for HOL Registry Broker.
 *
 * Provides typed methods for all HOL Registry Broker endpoints:
 * - Free: /search, /stats, /registries, /protocols, /resolve/{uaid}, /skills
 * - Metered: /register, /register/quote, /chat/session, /chat/message
 *
 * Sprint 37: Built for $8K HOL bounty (Workshop 4, Feb 23).
 */

const HOL_BASE_URL = 'https://hol.org/registry/api/v1';

// ── Types ──────────────────────────────────────────────────────────────

export interface HOLSearchParams {
  q?: string;
  minTrust?: number;
  limit?: number;
  page?: number;
  protocol?: string;
  registry?: string;
}

export interface HOLAgent {
  id: string;
  uaid: string;
  originalId?: string;
  registry: string;
  name: string;
  description?: string;
  capabilities?: string[];
  protocols?: string[];
  communicationSupported?: boolean;
  routingSupported?: boolean;
  endpoints?: Record<string, string>;
  profile?: {
    type?: string;
    version?: string;
    display_name?: string;
    bio?: string;
    aiAgent?: {
      type?: string;
      model?: string;
      capabilities?: string[];
    };
  };
  metadata?: Record<string, unknown>;
  trustScores?: Record<string, unknown>;
  trustScore?: number;
}

export interface HOLSearchResult {
  agents: HOLAgent[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface HOLStats {
  totalAgents: number;
  totalRegistries: number;
  totalProtocols: number;
  registries: Array<{ name: string; count: number }>;
  protocols: Array<{ name: string; count: number }>;
  lastUpdated: string;
}

export interface HOLRegistry {
  name: string;
  displayName?: string;
  agentCount: number;
  protocols?: string[];
  description?: string;
}

export interface HOLProtocol {
  name: string;
  agentCount: number;
  description?: string;
}

export interface HOLRegistrationPayload {
  name: string;
  description: string;
  capabilities?: string[];
  protocols?: string[];
  endpoints?: Record<string, string>;
  profile?: {
    type: string;
    version: string;
    display_name: string;
    bio: string;
    aiAgent?: {
      type: string;
      model?: string;
      capabilities?: string[];
      creator?: string;
    };
    properties?: Record<string, unknown>;
    socials?: Array<{ platform: string; handle: string }>;
  };
  communicationProtocol?: string;
  registry?: string;
  metadata?: Record<string, unknown>;
}

export interface HOLRegistrationQuote {
  credits: number;
  currency: string;
  estimatedProcessingTime?: string;
}

export interface HOLRegistrationResult {
  success: boolean;
  uaid?: string;
  agentId?: string;
  status?: string;
  error?: string;
}

export interface HOLChatSession {
  sessionId: string;
  agentUaid: string;
  status: 'active' | 'closed';
  createdAt: string;
}

export interface HOLChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export interface HOLChatResponse {
  message: HOLChatMessage;
  agentResponse?: HOLChatMessage;
}

export interface HOLSkill {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  agentId?: string;
  version?: string;
}

export interface HOLClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

// ── Client ──────────────────────────────────────────────────────────────

export class HOLRegistryClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private static CACHE_TTL = 60_000; // 1 minute cache for search/stats

  constructor(config?: HOLClientConfig) {
    this.baseUrl = (config?.baseUrl || HOL_BASE_URL).replace(/\/$/, '');
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 15_000;
  }

  // ── Free Endpoints ───────────────────────────────────────────────────

  /**
   * Search agents in the HOL Registry Broker index.
   * Free endpoint — no auth required.
   */
  async search(params: HOLSearchParams): Promise<HOLSearchResult> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.minTrust !== undefined) qs.set('minTrust', String(params.minTrust));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.protocol) qs.set('protocol', params.protocol);
    if (params.registry) qs.set('registry', params.registry);

    const url = `${this.baseUrl}/search?${qs.toString()}`;
    const cacheKey = `search:${qs.toString()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as HOLSearchResult;

    const data = await this.fetchJSON(url);
    const result = this.parseSearchResult(data);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get platform statistics from the HOL Registry Broker.
   * Free endpoint — no auth required.
   */
  async getStats(): Promise<HOLStats> {
    const cacheKey = 'stats';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as HOLStats;

    const data = await this.fetchJSON(`${this.baseUrl}/stats`);
    const result = this.parseStats(data);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * List all registries indexed by the HOL Registry Broker.
   * Free endpoint — no auth required.
   */
  async getRegistries(): Promise<HOLRegistry[]> {
    const cacheKey = 'registries';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as HOLRegistry[];

    const data = await this.fetchJSON(`${this.baseUrl}/registries`);
    const result = this.parseRegistries(data);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * List all protocols known to the HOL Registry Broker.
   * Free endpoint — no auth required.
   */
  async getProtocols(): Promise<HOLProtocol[]> {
    const cacheKey = 'protocols';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as HOLProtocol[];

    const data = await this.fetchJSON(`${this.baseUrl}/protocols`);
    const result = this.parseProtocols(data);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Resolve an agent by UAID.
   * Free endpoint — no auth required.
   */
  async resolve(uaid: string): Promise<HOLAgent | null> {
    const cacheKey = `resolve:${uaid}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached as HOLAgent;

    try {
      const data = await this.fetchJSON(`${this.baseUrl}/resolve/${encodeURIComponent(uaid)}`);
      const agent = this.parseAgent(data);
      this.setCache(cacheKey, agent);
      return agent;
    } catch (err) {
      if (err instanceof HOLApiError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * Find similar agents to a given UAID.
   * Free endpoint — no auth required.
   */
  async findSimilar(uaid: string, limit?: number): Promise<HOLAgent[]> {
    const qs = limit ? `?limit=${limit}` : '';
    const data = await this.fetchJSON(`${this.baseUrl}/agents/${encodeURIComponent(uaid)}/similar${qs}`);
    const agents = (Array.isArray(data) ? data : (data?.agents || data?.results || [])) as Record<string, unknown>[];
    return agents.map((a: Record<string, unknown>) => this.parseAgent(a));
  }

  /**
   * Browse HCS-26 skills in the registry.
   * Free endpoint — no auth required.
   */
  async getSkills(params?: { limit?: number; name?: string }): Promise<HOLSkill[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.name) qs.set('name', params.name);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const data = await this.fetchJSON(`${this.baseUrl}/skills${suffix}`);
    const skills = (Array.isArray(data) ? data : (data?.skills || data?.results || [])) as Record<string, unknown>[];
    return skills.map((s: Record<string, unknown>) => ({
      id: String(s.id || s.topic_id || ''),
      name: String(s.name || ''),
      description: String(s.description || ''),
      category: s.category as string | undefined,
      tags: s.tags as string[] | undefined,
      agentId: s.agentId as string | undefined,
      version: s.version as string | undefined,
    }));
  }

  // ── Metered Endpoints ────────────────────────────────────────────────

  /**
   * Get a price quote for registering an agent.
   * Metered endpoint — may require API key.
   */
  async getRegistrationQuote(payload: HOLRegistrationPayload): Promise<HOLRegistrationQuote> {
    const data = await this.fetchJSON(`${this.baseUrl}/register/quote`, {
      method: 'POST',
      body: payload,
      auth: true,
    });
    return {
      credits: (data?.credits || data?.cost || 0) as number,
      currency: (data?.currency || 'HBAR') as string,
      estimatedProcessingTime: data?.estimatedProcessingTime as string | undefined,
    };
  }

  /**
   * Register an agent with the HOL Registry Broker.
   * Metered endpoint — requires API key for production.
   */
  async register(payload: HOLRegistrationPayload): Promise<HOLRegistrationResult> {
    try {
      const data = await this.fetchJSON(`${this.baseUrl}/register`, {
        method: 'POST',
        body: payload,
        auth: true,
      });
      return {
        success: true,
        uaid: data?.uaid as string | undefined,
        agentId: (data?.agentId || data?.id) as string | undefined,
        status: (data?.status || 'registered') as string,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }

  /**
   * Create a chat session with a HOL agent.
   * Metered endpoint.
   */
  async createChatSession(agentUaid: string): Promise<HOLChatSession> {
    const data = await this.fetchJSON(`${this.baseUrl}/chat/session`, {
      method: 'POST',
      body: { agentUaid },
      auth: true,
    });
    return {
      sessionId: (data?.sessionId || data?.id || `session-${Date.now()}`) as string,
      agentUaid,
      status: 'active',
      createdAt: (data?.createdAt || new Date().toISOString()) as string,
    };
  }

  /**
   * Send a message in a HOL chat session.
   * Metered endpoint.
   */
  async sendChatMessage(sessionId: string, content: string): Promise<HOLChatResponse> {
    const data = await this.fetchJSON(`${this.baseUrl}/chat/message`, {
      method: 'POST',
      body: { sessionId, content },
      auth: true,
    });

    const userMessage: HOLChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const resp = data?.response as Record<string, unknown> | string | undefined;
    const agentResponse: HOLChatMessage | undefined = resp ? {
      id: (typeof resp === 'object' ? (resp as Record<string, unknown>).id : undefined) as string || `msg-${Date.now()}-agent`,
      role: 'agent' as const,
      content: (typeof resp === 'object' ? ((resp as Record<string, unknown>).content || String(resp)) : String(resp)) as string,
      timestamp: (typeof resp === 'object' ? (resp as Record<string, unknown>).timestamp : undefined) as string || new Date().toISOString(),
    } : undefined;

    return { message: userMessage, agentResponse };
  }

  // ── Cache ────────────────────────────────────────────────────────────

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private getFromCache(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiry: Date.now() + HOLRegistryClient.CACHE_TTL });
  }

  private async fetchJSON(url: string, opts?: { method?: string; body?: unknown; auth?: boolean }): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (opts?.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts?.auth && this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: opts?.method || 'GET',
        headers,
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new HOLApiError(
          `HOL API error: ${response.status} ${response.statusText}`,
          response.status,
          text,
        );
      }

      return await response.json() as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseSearchResult(data: Record<string, unknown>): HOLSearchResult {
    const rawAgents = (data?.agents || data?.results || []) as Record<string, unknown>[];
    return {
      agents: rawAgents.map(a => this.parseAgent(a)),
      total: (data?.total || rawAgents.length) as number,
      page: (data?.page || 1) as number,
      limit: (data?.limit || rawAgents.length) as number,
      hasMore: Boolean(data?.hasMore),
    };
  }

  private parseStats(data: Record<string, unknown>): HOLStats {
    return {
      totalAgents: (data?.totalAgents || data?.total_agents || 0) as number,
      totalRegistries: (data?.totalRegistries || data?.total_registries || 0) as number,
      totalProtocols: (data?.totalProtocols || data?.total_protocols || 0) as number,
      registries: (data?.registries || []) as Array<{ name: string; count: number }>,
      protocols: (data?.protocols || []) as Array<{ name: string; count: number }>,
      lastUpdated: (data?.lastUpdated || new Date().toISOString()) as string,
    };
  }

  private parseRegistries(data: unknown): HOLRegistry[] {
    const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.registries || []);
    return (raw as Record<string, unknown>[]).map(r => ({
      name: String(r.name || ''),
      displayName: r.displayName as string | undefined,
      agentCount: (r.agentCount || r.count || 0) as number,
      protocols: r.protocols as string[] | undefined,
      description: r.description as string | undefined,
    }));
  }

  private parseProtocols(data: unknown): HOLProtocol[] {
    const raw = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.protocols || []);
    return (raw as Record<string, unknown>[]).map(p => ({
      name: String(p.name || ''),
      agentCount: (p.agentCount || p.count || 0) as number,
      description: p.description as string | undefined,
    }));
  }

  parseAgent(data: Record<string, unknown>): HOLAgent {
    return {
      id: String(data.id || data.uaid || ''),
      uaid: String(data.uaid || data.id || ''),
      originalId: data.originalId as string | undefined,
      registry: String(data.registry || ''),
      name: String(data.name || data.display_name || 'Unknown'),
      description: (data.description || data.bio) as string | undefined,
      capabilities: data.capabilities as string[] | undefined,
      protocols: data.protocols as string[] | undefined,
      communicationSupported: data.communicationSupported as boolean | undefined,
      routingSupported: data.routingSupported as boolean | undefined,
      endpoints: data.endpoints as Record<string, string> | undefined,
      profile: data.profile as HOLAgent['profile'] | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
      trustScores: data.trustScores as Record<string, unknown> | undefined,
      trustScore: data.trustScore as number | undefined,
    };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// ── Error ──────────────────────────────────────────────────────────────

export class HOLApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'HOLApiError';
  }
}
