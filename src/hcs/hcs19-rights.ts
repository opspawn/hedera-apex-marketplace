/**
 * HCS-19: PrivacyRightsHandler
 *
 * Handles privacy rights requests (GDPR Art 15-21, CCPA).
 * Tracks request lifecycle and builds HCS messages for topic submission.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  HCS19Config,
  PrivacyRightsRequest,
  RightsType,
  RightsOperation,
} from './hcs19-types';
import { HCS19MessageFormatter } from './hcs19-topics';
import { HederaTestnetClient, MessageSubmitResult } from '../hedera/client';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Handles privacy rights requests (GDPR Art 15-21, CCPA).
 * Tracks request lifecycle and builds HCS messages for topic submission.
 */
export class PrivacyRightsHandler {
  private config: HCS19Config;
  private requests: Map<string, PrivacyRightsRequest>;
  private formatter: HCS19MessageFormatter;
  private rightsTopicId: string | null;
  private messageLog: string[];
  private hederaClient: HederaTestnetClient | null;

  constructor(config: HCS19Config, hederaClient?: HederaTestnetClient) {
    this.config = config;
    this.requests = new Map();
    this.formatter = new HCS19MessageFormatter(config.accountId);
    this.rightsTopicId = null;
    this.messageLog = [];
    this.hederaClient = hederaClient ?? null;
  }

  async init(rightsTopicId?: string): Promise<void> {
    this.rightsTopicId = rightsTopicId ?? null;
  }

  /** Submit a message to the HCS topic if client and topic are available */
  private async submitToTopic(serializedMessage: string): Promise<MessageSubmitResult | null> {
    if (!this.hederaClient || !this.rightsTopicId) return null;
    return this.hederaClient.submitMessage(this.rightsTopicId, serializedMessage);
  }

  /** Submit a privacy rights request */
  async submitRequest(params: {
    user_id: string;
    request_type: RightsType;
    jurisdiction: string;
    legal_basis: string;
    verification_method: string;
    fulfillment_method: string;
    response_method: string;
    expected_completion_days?: number;
  }): Promise<PrivacyRightsRequest> {
    const requestId = `req_${uuidv4()}`;
    const now = new Date();

    // Calculate deadline based on jurisdiction
    const deadlineDays =
      params.expected_completion_days ??
      PrivacyRightsHandler.getComplianceDeadline(params.jurisdiction, params.request_type);

    const expectedCompletion = addDays(now, deadlineDays).toISOString();

    const request: PrivacyRightsRequest = {
      request_id: requestId,
      user_id: params.user_id,
      agent_id: this.config.accountId,
      request_type: params.request_type,
      jurisdiction: params.jurisdiction,
      legal_basis: params.legal_basis,
      request_timestamp: now.toISOString(),
      verification_method: params.verification_method,
      fulfillment_method: params.fulfillment_method,
      expected_completion: expectedCompletion,
      response_method: params.response_method,
      status: 'pending',
      topic_id: this.rightsTopicId ?? undefined,
    };

    const message = this.formatter.buildRightsMessage(
      RightsOperation.RightsRequest,
      {
        request_id: requestId,
        user_id: params.user_id,
        request_type: params.request_type,
        jurisdiction: params.jurisdiction,
        legal_basis: params.legal_basis,
        verification_method: params.verification_method,
        fulfillment_method: params.fulfillment_method,
        m: `Privacy rights request (${params.request_type}) from user ${params.user_id} — ${params.legal_basis}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      request.sequence_number = txResult.sequenceNumber;
    }

    this.requests.set(requestId, request);
    return request;
  }

  /** Process a rights request (mark as in-progress) */
  async processRequest(requestId: string): Promise<PrivacyRightsRequest> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Rights request not found: ${requestId}`);
    }
    if (request.status === 'completed' || request.status === 'denied') {
      throw new Error(`Cannot process request with status: ${request.status}`);
    }

    request.status = 'in_progress';
    return request;
  }

  /** Complete a rights request */
  async completeRequest(requestId: string, notes?: string): Promise<PrivacyRightsRequest> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Rights request not found: ${requestId}`);
    }

    request.status = 'completed';
    request.actual_completion = new Date().toISOString();
    if (notes) {
      request.compliance_notes = notes;
    }

    // Choose the appropriate HCS operation based on request type
    let op: RightsOperation;
    switch (request.request_type) {
      case RightsType.Access:
        op = RightsOperation.AccessProvided;
        break;
      case RightsType.Rectification:
        op = RightsOperation.RectificationCompleted;
        break;
      case RightsType.Erasure:
        op = RightsOperation.ErasureCompleted;
        break;
      default:
        op = RightsOperation.RightsFulfilled;
        break;
    }

    const message = this.formatter.buildRightsMessage(op, {
      request_id: requestId,
      user_id: request.user_id,
      fulfillment_method: request.fulfillment_method,
      m: `Rights request ${requestId} fulfilled via ${request.fulfillment_method}`,
    });
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      request.sequence_number = txResult.sequenceNumber;
    }

    return request;
  }

  /** Deny a rights request */
  async denyRequest(requestId: string, reason: string): Promise<PrivacyRightsRequest> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Rights request not found: ${requestId}`);
    }

    request.status = 'denied';
    request.compliance_notes = reason;
    return request;
  }

  /** Get request by ID */
  async getRequest(requestId: string): Promise<PrivacyRightsRequest | null> {
    return this.requests.get(requestId) ?? null;
  }

  /** List requests by user */
  async listByUser(userId: string): Promise<PrivacyRightsRequest[]> {
    return Array.from(this.requests.values()).filter(r => r.user_id === userId);
  }

  /** List pending requests */
  async listPending(): Promise<PrivacyRightsRequest[]> {
    return Array.from(this.requests.values()).filter(
      r => r.status === 'pending' || r.status === 'in_progress',
    );
  }

  /** Calculate expected completion date based on jurisdiction */
  static getComplianceDeadline(jurisdiction: string, _requestType: RightsType): number {
    // GDPR: 30 days (Art 12), CCPA: 45 days (section 1798.130)
    if (jurisdiction === 'EU' || jurisdiction.startsWith('EU-')) return 30;
    if (jurisdiction === 'US-CA') return 45;
    return 30; // Default baseline
  }

  /** Get request status by ID */
  async getRequestStatus(requestId: string): Promise<string | null> {
    const request = this.requests.get(requestId);
    return request?.status ?? null;
  }

  /** Get all generated HCS messages (for testing/debugging) */
  getMessageLog(): string[] {
    return [...this.messageLog];
  }
}
