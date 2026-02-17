/**
 * KMS-Backed Agent Registration for Hedera.
 *
 * Full flow: Create KMS key → Extract public key → Create Hedera account → Register on HCS-10.
 * Supports key rotation with old-key retention for verification continuity.
 */

import {
  KMSKeyManager,
  KMSKeyInfo,
  KMSAuditEntry,
  IKMSClient,
  KMSKeySpec,
} from './kms-signer';

// ==========================================
// Types
// ==========================================

export interface KMSAgentConfig {
  name: string;
  description: string;
  keySpec?: KMSKeySpec;
  endpoint?: string;
  skills?: string[];
  tags?: Record<string, string>;
}

export interface KMSAgentRegistration {
  agentId: string;
  keyId: string;
  keyArn: string;
  hederaAccountId: string;
  publicKey: string;
  keySpec: KMSKeySpec;
  registeredAt: string;
  lastRotation?: string;
  rotationHistory: Array<{
    oldKeyId: string;
    newKeyId: string;
    rotatedAt: string;
  }>;
}

export interface KMSRegistrationResult {
  success: boolean;
  registration?: KMSAgentRegistration;
  error?: string;
  steps: Array<{
    step: string;
    status: 'completed' | 'failed';
    detail: string;
    durationMs: number;
  }>;
}

export interface KMSTransactionSignResult {
  success: boolean;
  keyId: string;
  signatureHex: string;
  algorithm: string;
  latencyMs: number;
  txHash?: string;
}

// ==========================================
// KMS Agent Registration Manager
// ==========================================

export class KMSAgentRegistrationManager {
  private keyManager: KMSKeyManager;
  private registrations: Map<string, KMSAgentRegistration> = new Map();
  private mockAccountCounter = 5000000;

  constructor(kmsClient: IKMSClient, region: string = 'us-east-1') {
    this.keyManager = new KMSKeyManager(kmsClient, region);
  }

  /**
   * Full KMS-backed agent registration flow:
   * 1. Create KMS ED25519 (or ECDSA) key
   * 2. Extract public key
   * 3. Create Hedera account with KMS-managed key
   * 4. Register agent in marketplace
   */
  async registerAgentWithKMS(config: KMSAgentConfig): Promise<KMSRegistrationResult> {
    const steps: KMSRegistrationResult['steps'] = [];
    const keySpec = config.keySpec || 'ECC_NIST_EDWARDS25519';

    // Step 1: Create KMS key
    let keyInfo: KMSKeyInfo;
    const step1Start = Date.now();
    try {
      keyInfo = await this.keyManager.createKey({
        keySpec,
        description: `Agent key: ${config.name}`,
        tags: {
          AgentName: config.name,
          Project: 'hedera-agent-marketplace',
          ...config.tags,
        },
      });
      steps.push({
        step: 'create_kms_key',
        status: 'completed',
        detail: `Created ${keySpec} key: ${keyInfo.keyId}`,
        durationMs: Date.now() - step1Start,
      });
    } catch (err) {
      steps.push({
        step: 'create_kms_key',
        status: 'failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - step1Start,
      });
      return { success: false, error: 'Failed to create KMS key', steps };
    }

    // Step 2: Create Hedera account (mock for demo — real would use AccountCreateTransaction)
    const step2Start = Date.now();
    let hederaAccountId: string;
    try {
      this.mockAccountCounter++;
      hederaAccountId = `0.0.${this.mockAccountCounter}`;
      steps.push({
        step: 'create_hedera_account',
        status: 'completed',
        detail: `Created Hedera account ${hederaAccountId} with KMS-managed ${keySpec === 'ECC_NIST_EDWARDS25519' ? 'ED25519' : 'ECDSA'} key`,
        durationMs: Date.now() - step2Start,
      });
    } catch (err) {
      steps.push({
        step: 'create_hedera_account',
        status: 'failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - step2Start,
      });
      return { success: false, error: 'Failed to create Hedera account', steps };
    }

    // Step 3: Register agent
    const step3Start = Date.now();
    const agentId = `kms-agent-${Date.now().toString(36)}`;
    const registration: KMSAgentRegistration = {
      agentId,
      keyId: keyInfo.keyId,
      keyArn: keyInfo.keyArn,
      hederaAccountId,
      publicKey: keyInfo.hederaPublicKey,
      keySpec,
      registeredAt: new Date().toISOString(),
      rotationHistory: [],
    };

    this.registrations.set(agentId, registration);
    this.keyManager.setAgentId(keyInfo.keyId, agentId);

    steps.push({
      step: 'register_agent',
      status: 'completed',
      detail: `Registered agent ${agentId} with KMS key ${keyInfo.keyId}`,
      durationMs: Date.now() - step3Start,
    });

    // Step 4: Register on HCS-10 (mock)
    const step4Start = Date.now();
    steps.push({
      step: 'hcs10_registration',
      status: 'completed',
      detail: `Agent ${config.name} registered on HCS-10 with account ${hederaAccountId}`,
      durationMs: Date.now() - step4Start,
    });

    return { success: true, registration, steps };
  }

  /**
   * Sign any Hedera transaction with an agent's KMS key.
   */
  async signAgentTransaction(
    keyId: string,
    transactionBytes: Uint8Array,
    txHash?: string,
  ): Promise<KMSTransactionSignResult> {
    try {
      const result = await this.keyManager.sign(keyId, transactionBytes, txHash);
      return {
        success: true,
        keyId: result.keyId,
        signatureHex: result.signature.toString('hex'),
        algorithm: result.algorithm,
        latencyMs: result.latencyMs,
        txHash,
      };
    } catch (err) {
      return {
        success: false,
        keyId,
        signatureHex: '',
        algorithm: '',
        latencyMs: 0,
        txHash,
      };
    }
  }

  /**
   * Rotate an agent's KMS key:
   * 1. Create new KMS key
   * 2. Update Hedera account key (would use AccountUpdateTransaction in production)
   * 3. Maintain old key for historical verification
   */
  async rotateAgentKey(agentId: string): Promise<{
    success: boolean;
    oldKeyId: string;
    newKeyId: string;
    newPublicKey: string;
    error?: string;
  }> {
    const registration = this.registrations.get(agentId);
    if (!registration) {
      return {
        success: false,
        oldKeyId: '',
        newKeyId: '',
        newPublicKey: '',
        error: `Agent ${agentId} not found`,
      };
    }

    const oldKeyId = registration.keyId;

    try {
      const newKeyInfo = await this.keyManager.rotateKey(oldKeyId);

      // Update registration
      registration.keyId = newKeyInfo.keyId;
      registration.keyArn = newKeyInfo.keyArn;
      registration.publicKey = newKeyInfo.hederaPublicKey;
      registration.lastRotation = new Date().toISOString();
      registration.rotationHistory.push({
        oldKeyId,
        newKeyId: newKeyInfo.keyId,
        rotatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        oldKeyId,
        newKeyId: newKeyInfo.keyId,
        newPublicKey: newKeyInfo.hederaPublicKey,
      };
    } catch (err) {
      return {
        success: false,
        oldKeyId,
        newKeyId: '',
        newPublicKey: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Get registration for an agent.
   */
  getRegistration(agentId: string): KMSAgentRegistration | undefined {
    return this.registrations.get(agentId);
  }

  /**
   * List all KMS-registered agents.
   */
  listRegistrations(): KMSAgentRegistration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * Get the key manager (for audit logs, stats, etc.)
   */
  getKeyManager(): KMSKeyManager {
    return this.keyManager;
  }

  /**
   * Get combined status for KMS integration.
   */
  getStatus(): {
    totalAgents: number;
    totalKeys: number;
    activeKeys: number;
    totalSignOperations: number;
    avgSignLatencyMs: number;
    costEstimate: { monthlyKeyStorage: number; totalMonthlyEstimate: number };
  } {
    const stats = this.keyManager.getStats();
    const cost = this.keyManager.getCostEstimate();
    return {
      totalAgents: this.registrations.size,
      totalKeys: stats.totalKeys,
      activeKeys: stats.activeKeys,
      totalSignOperations: stats.totalSignOperations,
      avgSignLatencyMs: stats.avgSignLatencyMs,
      costEstimate: {
        monthlyKeyStorage: cost.monthlyKeyStorage,
        totalMonthlyEstimate: cost.totalMonthlyEstimate,
      },
    };
  }
}
