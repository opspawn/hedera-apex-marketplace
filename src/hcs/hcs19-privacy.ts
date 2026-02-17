/**
 * HCS-19: Privacy and Consent Management
 *
 * Manages privacy consent records on HCS topics, aligned with
 * ISO/IEC TS 27560 consent record format. First known implementation.
 */

import { v4 as uuidv4 } from 'uuid';
import { PrivacyConsent, ConsentRequest } from '../types';

export interface HCS19Config {
  accountId: string;
  privateKey: string;
  network: 'testnet' | 'mainnet';
}

export class HCS19PrivacyManager {
  private config: HCS19Config;
  private consents: Map<string, PrivacyConsent> = new Map();

  constructor(config: HCS19Config) {
    this.config = config;
  }

  /**
   * Grant consent for an agent interaction.
   *
   * TODO [Sprint 1]: Implement on-chain consent record
   * - Create HCS topic for consent record
   * - Submit ISO/IEC TS 27560-aligned consent JSON
   * - Return consent with topic ID and sequence number
   */
  async grantConsent(request: ConsentRequest): Promise<PrivacyConsent> {
    const consent: PrivacyConsent = {
      id: uuidv4(),
      agent_id: request.agent_id,
      purposes: request.purposes,
      retention: request.retention,
      granted_at: new Date().toISOString(),
      expires_at: this.calculateExpiry(request.retention),
    };
    this.consents.set(consent.id, consent);
    return consent;
  }

  /**
   * Revoke a previously granted consent.
   *
   * TODO [Sprint 1]: Revoke on-chain
   * - Submit revocation message to consent topic
   * - Update consent record
   */
  async revokeConsent(consentId: string): Promise<PrivacyConsent> {
    const consent = this.consents.get(consentId);
    if (!consent) throw new Error(`Consent not found: ${consentId}`);
    consent.revoked_at = new Date().toISOString();
    this.consents.set(consentId, consent);
    return consent;
  }

  /**
   * Check if an agent has active consent for a given purpose.
   *
   * TODO [Sprint 1]: Query on-chain consent records
   */
  async checkConsent(agentId: string, purpose: string): Promise<{ consented: boolean; consent?: PrivacyConsent }> {
    for (const consent of this.consents.values()) {
      if (
        consent.agent_id === agentId &&
        consent.purposes.includes(purpose) &&
        !consent.revoked_at &&
        (!consent.expires_at || new Date(consent.expires_at) > new Date())
      ) {
        return { consented: true, consent };
      }
    }
    return { consented: false };
  }

  /**
   * Get a consent record by ID.
   */
  async getConsent(consentId: string): Promise<PrivacyConsent | null> {
    return this.consents.get(consentId) || null;
  }

  /**
   * List all consents for an agent.
   */
  async listConsents(agentId: string): Promise<PrivacyConsent[]> {
    const results: PrivacyConsent[] = [];
    for (const consent of this.consents.values()) {
      if (consent.agent_id === agentId) {
        results.push(consent);
      }
    }
    return results;
  }

  /**
   * Create a private encrypted channel for sensitive interactions.
   *
   * TODO [Sprint 1]: Implement HCS-19 encrypted topic
   * - Create topic with encrypted submit key
   * - Only consented parties can decrypt
   */
  async createPrivateChannel(agentId: string, participantIds: string[]): Promise<string> {
    // TODO: Create encrypted HCS topic
    return `0.0.${Date.now()}`;
  }

  private calculateExpiry(retention: string): string {
    const now = new Date();
    const match = retention.match(/^(\d+)([dhm])$/);
    if (!match) return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const value = parseInt(match[1]);
    switch (match[2]) {
      case 'd': now.setDate(now.getDate() + value); break;
      case 'h': now.setHours(now.getHours() + value); break;
      case 'm': now.setMonth(now.getMonth() + value); break;
    }
    return now.toISOString();
  }
}
