/**
 * HCS-19: Topic Setup & Message Formatting
 *
 * Handles creation of the 4 HCS-19 privacy compliance topics
 * and formatting/parsing of HCS messages.
 *
 * Topic memo format: hcs-19:0:{ttl}:{type}:{account}:{jurisdiction}
 */

import {
  HCS19Config,
  HCS19TopicType,
  HCS19TopicMemo,
  HCS19TopicSet,
  HCS19Message,
  HCS19Operation,
  ConsentMessage,
  ConsentOperation,
  ProcessingMessage,
  ProcessingOperation,
  RightsMessage,
  RightsOperation,
  AuditMessage,
  AuditOperation,
} from './hcs19-types';
import { HederaTestnetClient } from '../hedera/client';

const DEFAULT_TTL = 7776000; // 90 days in seconds

/**
 * HCS-19 Topic Setup — creates and manages the 4 privacy compliance topics.
 *
 * When a HederaTestnetClient is provided, creates real HCS topics on-chain.
 * Falls back to placeholder topic IDs when no client is available.
 */
export class HCS19TopicSetup {
  private config: HCS19Config;
  private hederaClient: HederaTestnetClient | null;

  constructor(config: HCS19Config, hederaClient?: HederaTestnetClient) {
    this.config = config;
    this.hederaClient = hederaClient ?? null;
  }

  /** Create all 4 HCS-19 topics for an agent */
  async createTopicSet(jurisdiction: string, ttl?: number): Promise<HCS19TopicSet> {
    const effectiveTtl = ttl ?? this.config.defaultTtl ?? DEFAULT_TTL;

    const consentTopicId = await this.createTopic(HCS19TopicType.ConsentManagement, jurisdiction, effectiveTtl);
    const processingTopicId = await this.createTopic(HCS19TopicType.DataProcessing, jurisdiction, effectiveTtl);
    const rightsTopicId = await this.createTopic(HCS19TopicType.PrivacyRights, jurisdiction, effectiveTtl);
    const auditTopicId = await this.createTopic(HCS19TopicType.ComplianceAudit, jurisdiction, effectiveTtl);

    const now = new Date().toISOString();
    return {
      consent_topic_id: consentTopicId,
      processing_topic_id: processingTopicId,
      rights_topic_id: rightsTopicId,
      audit_topic_id: auditTopicId,
      agent_id: this.config.accountId,
      jurisdiction,
      created_at: now,
    };
  }

  /** Create a single topic with proper memo */
  async createTopic(topicType: HCS19TopicType, jurisdiction: string, ttl: number): Promise<string> {
    const memo = HCS19TopicSetup.buildTopicMemo(topicType, this.config.accountId, jurisdiction, ttl);

    if (this.hederaClient) {
      const topicInfo = await this.hederaClient.createTopic(memo);
      return topicInfo.topicId;
    }

    // Fallback: return placeholder topic ID when no client
    return `0.0.placeholder_${topicType}`;
  }

  /** Parse a topic memo string back to structured data */
  static parseTopicMemo(memo: string): HCS19TopicMemo | null {
    const parts = memo.split(':');
    if (parts.length !== 6 || parts[0] !== 'hcs-19') {
      return null;
    }

    const version = parseInt(parts[1], 10);
    const ttl = parseInt(parts[2], 10);
    const topicType = parseInt(parts[3], 10);

    if (isNaN(version) || isNaN(ttl) || isNaN(topicType)) {
      return null;
    }

    if (!(topicType in HCS19TopicType)) {
      return null;
    }

    return {
      protocol: 'hcs-19',
      version: 0,
      ttl,
      topic_type: topicType as HCS19TopicType,
      agent_account_id: parts[4],
      jurisdiction: parts[5],
    };
  }

  /** Build the memo string for topic creation */
  static buildTopicMemo(
    topicType: HCS19TopicType,
    agentAccountId: string,
    jurisdiction: string,
    ttl: number,
  ): string {
    return `hcs-19:0:${ttl}:${topicType}:${agentAccountId}:${jurisdiction}`;
  }
}

/**
 * HCS-19 Message Formatter — builds, serializes, and validates HCS messages.
 */
export class HCS19MessageFormatter {
  private operatorId: string;

  constructor(operatorId: string) {
    this.operatorId = operatorId;
  }

  /** Build a consent message */
  buildConsentMessage(op: ConsentOperation, fields: Partial<ConsentMessage>): ConsentMessage {
    return {
      p: 'hcs-19',
      op,
      operator_id: this.operatorId,
      timestamp: new Date().toISOString(),
      m: fields.m ?? '',
      consent_id: fields.consent_id ?? '',
      user_id: fields.user_id ?? '',
      ...fields,
    } as ConsentMessage;
  }

  /** Build a data processing message */
  buildProcessingMessage(op: ProcessingOperation, fields: Partial<ProcessingMessage>): ProcessingMessage {
    return {
      p: 'hcs-19',
      op,
      operator_id: this.operatorId,
      timestamp: new Date().toISOString(),
      m: fields.m ?? '',
      processing_id: fields.processing_id ?? '',
      ...fields,
    } as ProcessingMessage;
  }

  /** Build a privacy rights message */
  buildRightsMessage(op: RightsOperation, fields: Partial<RightsMessage>): RightsMessage {
    return {
      p: 'hcs-19',
      op,
      operator_id: this.operatorId,
      timestamp: new Date().toISOString(),
      m: fields.m ?? '',
      request_id: fields.request_id ?? '',
      ...fields,
    } as RightsMessage;
  }

  /** Build an audit message */
  buildAuditMessage(op: AuditOperation, fields: Partial<AuditMessage>): AuditMessage {
    return {
      p: 'hcs-19',
      op,
      operator_id: this.operatorId,
      timestamp: new Date().toISOString(),
      m: fields.m ?? '',
      audit_id: fields.audit_id ?? '',
      ...fields,
    } as AuditMessage;
  }

  /** Serialize message to JSON string for HCS submission */
  static serialize(message: HCS19Message): string {
    return JSON.stringify(message);
  }

  /** Deserialize HCS message from topic */
  static deserialize(json: string): HCS19Message | null {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.p === 'hcs-19' && parsed.op && parsed.operator_id) {
        return parsed as HCS19Message;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Validate a message has all required fields for its operation */
  static validate(message: HCS19Message): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (message.p !== 'hcs-19') {
      errors.push('Protocol must be "hcs-19"');
    }
    if (!message.op) {
      errors.push('Operation (op) is required');
    }
    if (!message.operator_id) {
      errors.push('Operator ID is required');
    }
    if (!message.timestamp) {
      errors.push('Timestamp is required');
    }

    return { valid: errors.length === 0, errors };
  }
}
