/**
 * HCS-19: ConsentManager
 *
 * Manages user consent records with full HCS-19 compliance.
 * Handles grant, withdraw, update, verify operations and
 * builds consent HCS messages for topic submission.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  HCS19Config,
  UserConsentRecord,
  ConsentReceipt,
  GrantConsentRequest,
  ConsentQueryFilters,
  ConsentOperation,
  ConsentStatus,
} from './hcs19-types';
import { HCS19MessageFormatter } from './hcs19-topics';
import { HederaTestnetClient, MessageSubmitResult } from '../hedera/client';

// ============================================================
// Helpers
// ============================================================

function parseRetentionPeriod(period: string): number | null {
  const match = period.match(/^(\d+)_(year|month|day|week)s?$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'year':
      return value * 365;
    case 'month':
      return value * 30;
    case 'week':
      return value * 7;
    case 'day':
      return value;
    default:
      return null;
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Manages user consent records with full HCS-19 compliance.
 * Handles grant, withdraw, update, verify operations and
 * builds consent HCS messages for topic submission.
 */
export class ConsentManager {
  private config: HCS19Config;
  private consents: Map<string, UserConsentRecord>;
  private formatter: HCS19MessageFormatter;
  private consentTopicId: string | null;
  private messageLog: string[];
  private hederaClient: HederaTestnetClient | null;

  constructor(config: HCS19Config, hederaClient?: HederaTestnetClient) {
    this.config = config;
    this.consents = new Map();
    this.formatter = new HCS19MessageFormatter(config.accountId);
    this.consentTopicId = null;
    this.messageLog = [];
    this.hederaClient = hederaClient ?? null;
  }

  /** Initialize with existing topic or create new one */
  async init(consentTopicId?: string, _jurisdiction?: string): Promise<void> {
    this.consentTopicId = consentTopicId ?? null;
  }

  /** Submit a message to the HCS topic if client and topic are available */
  private async submitToTopic(serializedMessage: string): Promise<MessageSubmitResult | null> {
    if (!this.hederaClient || !this.consentTopicId) return null;
    return this.hederaClient.submitMessage(this.consentTopicId, serializedMessage);
  }

  /** Grant consent — creates full UserConsentRecord with all 13 required fields */
  async grantConsent(request: GrantConsentRequest): Promise<{
    consent: UserConsentRecord;
    receipt: ConsentReceipt;
  }> {
    if (!request.purposes || request.purposes.length === 0) {
      throw new Error('purposes must be a non-empty array');
    }
    if (!request.data_types || request.data_types.length === 0) {
      throw new Error('data_types must be a non-empty array');
    }
    if (!request.jurisdiction) {
      throw new Error('jurisdiction is required');
    }

    const consentId = `consent_${uuidv4()}`;
    const now = new Date().toISOString();

    // Calculate expiry from retention period
    let expiryDate: string | undefined;
    const retentionDays = parseRetentionPeriod(request.retention_period);
    if (retentionDays) {
      expiryDate = addDays(new Date(), retentionDays).toISOString();
    }

    const consent: UserConsentRecord = {
      consent_id: consentId,
      user_id: request.user_id,
      agent_id: this.config.accountId,
      jurisdiction: request.jurisdiction,
      legal_basis: request.legal_basis,
      purposes: [...request.purposes],
      data_types: [...request.data_types],
      consent_method: request.consent_method,
      consent_timestamp: now,
      retention_period: request.retention_period,
      withdrawal_method: request.withdrawal_method,
      status: ConsentStatus.Active,
      notice_reference: request.notice_reference,
      expiry_date: expiryDate,
      granular_permissions: request.granular_permissions
        ? { ...request.granular_permissions }
        : undefined,
      gdpr: request.gdpr ? { ...request.gdpr } : undefined,
      ccpa: request.ccpa ? { ...request.ccpa } : undefined,
      ddp: request.ddp ? { ...request.ddp } : undefined,
      topic_id: this.consentTopicId ?? undefined,
    };

    // Build HCS message
    const message = this.formatter.buildConsentMessage(
      ConsentOperation.ConsentGranted,
      {
        consent_id: consentId,
        user_id: request.user_id,
        purposes: request.purposes,
        legal_basis: request.legal_basis,
        jurisdiction: request.jurisdiction,
        consent_method: request.consent_method,
        data_types: request.data_types,
        retention_period: request.retention_period,
        withdrawal_method: request.withdrawal_method,
        notice_reference: request.notice_reference,
        status: ConsentStatus.Active,
        gdpr_lawful_basis: request.gdpr?.gdpr_lawful_basis,
        m: `Consent granted for user ${request.user_id} — purposes: ${request.purposes.join(', ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      consent.sequence_number = txResult.sequenceNumber;
    }

    // Store
    this.consents.set(consentId, consent);

    const receipt = this.generateReceipt(
      consent,
      ConsentOperation.ConsentGranted,
      txResult ? `${this.consentTopicId}@${txResult.sequenceNumber}` : undefined,
    );
    return { consent, receipt };
  }

  /** Withdraw consent — updates status to 'withdrawn' */
  async withdrawConsent(consentId: string): Promise<{
    consent: UserConsentRecord;
    receipt: ConsentReceipt;
  }> {
    const consent = this.consents.get(consentId);
    if (!consent) {
      throw new Error(`Consent record not found: ${consentId}`);
    }
    if (consent.status === ConsentStatus.Withdrawn) {
      throw new Error(`Consent already withdrawn: ${consentId}`);
    }

    consent.status = ConsentStatus.Withdrawn;

    // Build HCS message
    const message = this.formatter.buildConsentMessage(
      ConsentOperation.ConsentWithdrawn,
      {
        consent_id: consentId,
        user_id: consent.user_id,
        status: ConsentStatus.Withdrawn,
        m: `Consent withdrawn for user ${consent.user_id}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      consent.sequence_number = txResult.sequenceNumber;
    }

    const receipt = this.generateReceipt(
      consent,
      ConsentOperation.ConsentWithdrawn,
      txResult ? `${this.consentTopicId}@${txResult.sequenceNumber}` : undefined,
    );
    return { consent, receipt };
  }

  /** Revoke consent — sets status to withdrawn with a mandatory reason */
  async revokeConsent(consentId: string, reason: string): Promise<{
    consent: UserConsentRecord;
    receipt: ConsentReceipt;
  }> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Revocation reason is required');
    }

    const consent = this.consents.get(consentId);
    if (!consent) {
      throw new Error(`Consent record not found: ${consentId}`);
    }
    if (consent.status === ConsentStatus.Withdrawn) {
      throw new Error(`Consent already revoked: ${consentId}`);
    }

    const now = new Date().toISOString();
    consent.status = ConsentStatus.Withdrawn;
    consent.revocation_reason = reason.trim();
    consent.revocation_timestamp = now;

    // Build HCS message
    const message = this.formatter.buildConsentMessage(
      ConsentOperation.ConsentWithdrawn,
      {
        consent_id: consentId,
        user_id: consent.user_id,
        status: ConsentStatus.Withdrawn,
        m: `Consent revoked for user ${consent.user_id} — reason: ${reason.trim()}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      consent.sequence_number = txResult.sequenceNumber;
    }

    const receipt = this.generateReceipt(
      consent,
      ConsentOperation.ConsentWithdrawn,
      txResult ? `${this.consentTopicId}@${txResult.sequenceNumber}` : undefined,
    );
    return { consent, receipt };
  }

  /** Query consents for a user with optional filtering */
  async queryConsent(userId: string, filters?: ConsentQueryFilters): Promise<UserConsentRecord[]> {
    let results = Array.from(this.consents.values()).filter(c => c.user_id === userId);

    if (!filters) return results;

    if (filters.status) {
      results = results.filter(c => c.status === filters.status);
    }

    if (filters.active_only) {
      results = results.filter(c => c.status === ConsentStatus.Active && !this.isExpired(c));
    }

    if (filters.purpose) {
      results = results.filter(c => c.purposes.includes(filters.purpose!));
    }

    if (filters.jurisdiction) {
      results = results.filter(c => c.jurisdiction === filters.jurisdiction);
    }

    if (filters.legal_basis) {
      results = results.filter(c => c.legal_basis === filters.legal_basis);
    }

    if (filters.data_type) {
      results = results.filter(c => c.data_types.includes(filters.data_type!));
    }

    return results;
  }

  /** Update consent — modifies consent preferences */
  async updateConsent(consentId: string, updates: Partial<GrantConsentRequest>): Promise<{
    consent: UserConsentRecord;
    receipt: ConsentReceipt;
  }> {
    const consent = this.consents.get(consentId);
    if (!consent) {
      throw new Error(`Consent record not found: ${consentId}`);
    }
    if (consent.status !== ConsentStatus.Active) {
      throw new Error(`Cannot update non-active consent: ${consentId}`);
    }

    // Apply updates
    if (updates.purposes && updates.purposes.length > 0) {
      consent.purposes = [...updates.purposes];
    }
    if (updates.data_types && updates.data_types.length > 0) {
      consent.data_types = [...updates.data_types];
    }
    if (updates.retention_period) {
      consent.retention_period = updates.retention_period;
      const retentionDays = parseRetentionPeriod(updates.retention_period);
      if (retentionDays) {
        consent.expiry_date = addDays(new Date(), retentionDays).toISOString();
      }
    }
    if (updates.granular_permissions) {
      consent.granular_permissions = { ...updates.granular_permissions };
    }

    // Build HCS message
    const message = this.formatter.buildConsentMessage(
      ConsentOperation.ConsentUpdated,
      {
        consent_id: consentId,
        user_id: consent.user_id,
        purposes: consent.purposes,
        status: consent.status,
        m: `Consent updated for user ${consent.user_id}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      consent.sequence_number = txResult.sequenceNumber;
    }

    const receipt = this.generateReceipt(
      consent,
      ConsentOperation.ConsentUpdated,
      txResult ? `${this.consentTopicId}@${txResult.sequenceNumber}` : undefined,
    );
    return { consent, receipt };
  }

  /** Verify consent — checks if consent is active for a user+purpose */
  async verifyConsent(userId: string, purpose: string): Promise<{
    consented: boolean;
    consent?: UserConsentRecord;
    receipt?: ConsentReceipt;
  }> {
    // Find active, non-expired consent for this user+purpose
    const userConsents = Array.from(this.consents.values()).filter(
      c => c.user_id === userId && c.status === ConsentStatus.Active,
    );

    for (const consent of userConsents) {
      if (this.isExpired(consent)) continue;
      if (consent.purposes.includes(purpose)) {
        // Build verification message
        const message = this.formatter.buildConsentMessage(
          ConsentOperation.ConsentVerified,
          {
            consent_id: consent.consent_id,
            user_id: userId,
            status: consent.status,
            m: `Consent verified for user ${userId} — purpose: ${purpose}`,
          },
        );
        const serialized = HCS19MessageFormatter.serialize(message);
        this.messageLog.push(serialized);

        // Submit to HCS topic
        const txResult = await this.submitToTopic(serialized);

        const receipt = this.generateReceipt(
          consent,
          ConsentOperation.ConsentVerified,
          txResult ? `${this.consentTopicId}@${txResult.sequenceNumber}` : undefined,
        );
        return { consented: true, consent, receipt };
      }
    }

    return { consented: false };
  }

  /** Get a consent record by ID */
  async getConsent(consentId: string): Promise<UserConsentRecord | null> {
    return this.consents.get(consentId) ?? null;
  }

  /** List all consents for a user */
  async listConsents(userId: string): Promise<UserConsentRecord[]> {
    return Array.from(this.consents.values()).filter(c => c.user_id === userId);
  }

  /** List active consents for an agent */
  async listActiveConsents(agentId: string): Promise<UserConsentRecord[]> {
    return Array.from(this.consents.values()).filter(
      c => c.agent_id === agentId && c.status === ConsentStatus.Active,
    );
  }

  /** Check if consent has expired */
  isExpired(consent: UserConsentRecord): boolean {
    if (!consent.expiry_date) return false;
    return new Date(consent.expiry_date) < new Date();
  }

  /** Generate a human-readable consent receipt */
  generateReceipt(
    consent: UserConsentRecord,
    operation: ConsentOperation,
    txId?: string,
  ): ConsentReceipt {
    return {
      receipt_id: `rcpt_${uuidv4()}`,
      consent_id: consent.consent_id,
      operation,
      transaction_id: txId,
      topic_id: consent.topic_id ?? this.consentTopicId ?? '',
      sequence_number: consent.sequence_number,
      timestamp: new Date().toISOString(),
      human_readable: `Consent ${operation} for user ${consent.user_id}`,
    };
  }

  /** Get all generated HCS messages (for testing/debugging) */
  getMessageLog(): string[] {
    return [...this.messageLog];
  }
}
