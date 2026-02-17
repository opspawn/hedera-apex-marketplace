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
          version: '0.16.0',
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
