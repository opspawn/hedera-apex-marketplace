/**
 * Registry Broker Authentication & Live Registration
 *
 * Handles authentication with Hedera testnet credentials and manages
 * the live registration flow for the HOL Registry Broker.
 *
 * Sprint 18 — completes the registration gap for the $8K HOL bounty.
 *
 * Registration payload:
 *   type: AI_AGENT
 *   name: 'OpSpawn Agent Marketplace'
 *   communicationProtocol: 'hcs-10'
 *   capabilities: TEXT_GENERATION, CODE_GENERATION
 */

import { RegistryBroker, RegistrationResult } from './registry-broker';
import { loadConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export interface LiveRegistrationConfig {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
  brokerBaseUrl?: string;
  agentEndpoint?: string;
}

export interface LiveRegistrationResult {
  success: boolean;
  uaid?: string;
  agentId?: string;
  error?: string;
  timestamp: string;
  stored: boolean;
}

export interface LiveVerificationResult {
  verified: boolean;
  agentFound: boolean;
  uaid?: string;
  agentId?: string;
  timestamp: string;
}

const REGISTRATION_STATE_PATH = path.join(process.cwd(), 'state', 'registry-registration.json');

export class RegistryAuth {
  private config: LiveRegistrationConfig;
  private broker: RegistryBroker;
  private registrationState: LiveRegistrationResult | null = null;

  constructor(config: LiveRegistrationConfig) {
    this.config = config;
    this.broker = new RegistryBroker({
      accountId: config.accountId,
      privateKey: config.privateKey,
      network: config.network,
      brokerBaseUrl: config.brokerBaseUrl,
      agentEndpoint: config.agentEndpoint || 'https://hedera.opspawn.com/api/agent',
    });
    this.loadState();
  }

  /**
   * Register the agent with the live HOL Registry Broker.
   *
   * Authenticates with Hedera testnet credentials, builds an agent profile
   * with AI_AGENT type, and submits to the broker for indexing.
   */
  async registerLive(): Promise<LiveRegistrationResult> {
    try {
      const result = await this.broker.register();

      const liveResult: LiveRegistrationResult = {
        success: result.success,
        uaid: result.uaid,
        agentId: result.agentId,
        error: result.error,
        timestamp: new Date().toISOString(),
        stored: false,
      };

      // Persist state for re-use across restarts
      if (result.success) {
        this.registrationState = liveResult;
        this.saveState();
        liveResult.stored = true;
      }

      return liveResult;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown registration error';
      return {
        success: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        stored: false,
      };
    }
  }

  /**
   * Verify that our agent is registered and searchable in the broker index.
   */
  async verifyLive(): Promise<LiveVerificationResult> {
    try {
      const verified = await this.broker.verifyRegistration();
      const status = this.broker.getStatus();

      return {
        verified,
        agentFound: verified,
        uaid: status.uaid || this.registrationState?.uaid,
        agentId: status.agentId || this.registrationState?.agentId,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      return {
        verified: false,
        agentFound: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current registration state (from memory or persisted file).
   */
  getRegistrationState(): LiveRegistrationResult | null {
    return this.registrationState;
  }

  /**
   * Check if the agent has valid Hedera credentials for authentication.
   */
  hasValidCredentials(): boolean {
    return !!(this.config.accountId && this.config.privateKey && this.config.privateKey.length > 10);
  }

  /**
   * Get the broker instance for direct operations.
   */
  getBroker(): RegistryBroker {
    return this.broker;
  }

  private loadState(): void {
    try {
      if (fs.existsSync(REGISTRATION_STATE_PATH)) {
        const data = fs.readFileSync(REGISTRATION_STATE_PATH, 'utf-8');
        this.registrationState = JSON.parse(data);
      }
    } catch {
      // State file missing or corrupt — start fresh
      this.registrationState = null;
    }
  }

  private saveState(): void {
    try {
      const dir = path.dirname(REGISTRATION_STATE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(REGISTRATION_STATE_PATH, JSON.stringify(this.registrationState, null, 2));
    } catch {
      // Non-fatal — state won't persist across restarts
    }
  }

  /**
   * Create from app config and credential files.
   */
  static fromConfig(): RegistryAuth {
    const config = loadConfig();

    // Try to load private key from credential file if env is empty
    let privateKey = config.hedera.privateKey;
    if (!privateKey) {
      try {
        const credPath = path.join('/home/agent/credentials', 'hedera.json');
        if (fs.existsSync(credPath)) {
          const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
          privateKey = creds.privateKey || creds.private_key || '';
        }
      } catch {
        // No credential file available
      }
    }

    return new RegistryAuth({
      accountId: config.hedera.accountId,
      privateKey,
      network: config.hedera.network,
    });
  }
}
