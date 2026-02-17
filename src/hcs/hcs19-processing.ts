/**
 * HCS-19: DataProcessingRegistry
 *
 * Tracks data processing activities with consent verification
 * and builds processing HCS messages for topic submission.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  HCS19Config,
  DataProcessingRecord,
  ProcessingBasis,
  ProcessingOperation,
  RegisterProcessingActivityRequest,
  DataSharingRecord,
  DeletionRecord,
  ProcessingActivityFilters,
  ProcessingActivityStatus,
} from './hcs19-types';
import { HCS19MessageFormatter } from './hcs19-topics';
import { HederaTestnetClient, MessageSubmitResult } from '../hedera/client';

/**
 * Tracks data processing activities with consent verification
 * and builds processing HCS messages for topic submission.
 */
export class DataProcessingRegistry {
  private config: HCS19Config;
  private records: Map<string, DataProcessingRecord>;
  private sharingRecords: Map<string, DataSharingRecord[]>;
  private deletionRecords: Map<string, DeletionRecord[]>;
  private formatter: HCS19MessageFormatter;
  private processingTopicId: string | null;
  private messageLog: string[];
  private hederaClient: HederaTestnetClient | null;

  constructor(config: HCS19Config, hederaClient?: HederaTestnetClient) {
    this.config = config;
    this.records = new Map();
    this.sharingRecords = new Map();
    this.deletionRecords = new Map();
    this.formatter = new HCS19MessageFormatter(config.accountId);
    this.processingTopicId = null;
    this.messageLog = [];
    this.hederaClient = hederaClient ?? null;
  }

  async init(processingTopicId?: string): Promise<void> {
    this.processingTopicId = processingTopicId ?? null;
  }

  /** Submit a message to the HCS topic if client and topic are available */
  private async submitToTopic(serializedMessage: string): Promise<MessageSubmitResult | null> {
    if (!this.hederaClient || !this.processingTopicId) return null;
    return this.hederaClient.submitMessage(this.processingTopicId, serializedMessage);
  }

  /** Register start of data processing activity */
  async registerProcessing(params: {
    user_id: string;
    purpose: string;
    legal_basis: ProcessingBasis;
    data_types: string[];
    processing_method: string;
    duration: string;
    security_measures: string[];
    consent_id?: string;
  }): Promise<DataProcessingRecord> {
    const processingId = `proc_${uuidv4()}`;
    const now = new Date().toISOString();

    const record: DataProcessingRecord = {
      processing_id: processingId,
      user_id: params.user_id,
      agent_id: this.config.accountId,
      purpose: params.purpose,
      legal_basis: params.legal_basis,
      data_types: [...params.data_types],
      processing_method: params.processing_method,
      duration: params.duration,
      security_measures: [...params.security_measures],
      start_timestamp: now,
      end_timestamp: '',
      compliance_status: 'in_progress',
      consent_id: params.consent_id,
      topic_id: this.processingTopicId ?? undefined,
    };

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.ProcessingStarted,
      {
        processing_id: processingId,
        user_id: params.user_id,
        purpose: params.purpose,
        legal_basis: params.legal_basis,
        data_types: params.data_types,
        processing_method: params.processing_method,
        m: `Processing started for user ${params.user_id} — purpose: ${params.purpose}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      record.sequence_number = txResult.sequenceNumber;
    }

    this.records.set(processingId, record);
    return record;
  }

  /** Record completion of processing activity */
  async completeProcessing(processingId: string, complianceStatus: string): Promise<DataProcessingRecord> {
    const record = this.records.get(processingId);
    if (!record) {
      throw new Error(`Processing record not found: ${processingId}`);
    }

    record.end_timestamp = new Date().toISOString();
    record.compliance_status = complianceStatus;

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.ProcessingCompleted,
      {
        processing_id: processingId,
        compliance_status: complianceStatus,
        m: `Processing completed: ${processingId} — status: ${complianceStatus}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      record.sequence_number = txResult.sequenceNumber;
    }

    return record;
  }

  /** Record data sharing with third party */
  async shareData(processingId: string, thirdParties: string[], dataTypes: string[]): Promise<DataProcessingRecord> {
    const record = this.records.get(processingId);
    if (!record) {
      throw new Error(`Processing record not found: ${processingId}`);
    }

    record.third_parties = [
      ...(record.third_parties ?? []),
      ...thirdParties,
    ];

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.DataShared,
      {
        processing_id: processingId,
        third_parties: thirdParties,
        data_types: dataTypes,
        m: `Data shared with ${thirdParties.join(', ')} — types: ${dataTypes.join(', ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return record;
  }

  /** Record data deletion */
  async deleteData(processingId: string, userId: string, dataTypes: string[]): Promise<DataProcessingRecord> {
    const record = this.records.get(processingId);
    if (!record) {
      throw new Error(`Processing record not found: ${processingId}`);
    }

    record.compliance_status = 'data_deleted';

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.DataDeleted,
      {
        processing_id: processingId,
        user_id: userId,
        data_types: dataTypes,
        m: `Data deleted for user ${userId} — types: ${dataTypes.join(', ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return record;
  }

  /** Get processing record by ID */
  async getRecord(processingId: string): Promise<DataProcessingRecord | null> {
    return this.records.get(processingId) ?? null;
  }

  /** List all processing records for a user */
  async listByUser(userId: string): Promise<DataProcessingRecord[]> {
    return Array.from(this.records.values()).filter(r => r.user_id === userId);
  }

  // ============================================================
  // Enhanced DataProcessingRegistry methods (HCS-19 Sprint 17)
  // ============================================================

  /** Register a new data processing activity with purpose, legal basis, data categories, retention period */
  async registerProcessingActivity(request: RegisterProcessingActivityRequest): Promise<DataProcessingRecord> {
    if (!request.purpose || request.purpose.trim().length === 0) {
      throw new Error('Processing purpose is required');
    }
    if (!request.data_categories || request.data_categories.length === 0) {
      throw new Error('data_categories must be a non-empty array');
    }
    if (!request.controller_id || request.controller_id.trim().length === 0) {
      throw new Error('controller_id is required');
    }

    const processingId = `proc_${uuidv4()}`;
    const now = new Date().toISOString();

    const record: DataProcessingRecord = {
      processing_id: processingId,
      user_id: request.user_id,
      agent_id: request.controller_id,
      purpose: request.purpose,
      legal_basis: request.legal_basis,
      data_types: [...request.data_categories],
      processing_method: request.processing_method,
      duration: request.retention_period,
      security_measures: [...request.security_measures],
      start_timestamp: now,
      end_timestamp: '',
      compliance_status: ProcessingActivityStatus.Active,
      consent_id: request.consent_id,
      topic_id: this.processingTopicId ?? undefined,
      third_parties: [],
    };

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.ProcessingStarted,
      {
        processing_id: processingId,
        user_id: request.user_id,
        purpose: request.purpose,
        legal_basis: request.legal_basis,
        data_types: request.data_categories,
        processing_method: request.processing_method,
        m: `Processing activity registered by ${request.controller_id} — purpose: ${request.purpose}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    const txResult = await this.submitToTopic(serialized);
    if (txResult) {
      record.sequence_number = txResult.sequenceNumber;
    }

    this.records.set(processingId, record);
    this.sharingRecords.set(processingId, []);
    this.deletionRecords.set(processingId, []);
    return record;
  }

  /** Record data sharing with a third party */
  async recordDataSharing(
    processingId: string,
    recipient: string,
    purpose: string,
    safeguards: string[],
  ): Promise<DataSharingRecord> {
    const record = this.records.get(processingId);
    if (!record) {
      throw new Error(`Processing record not found: ${processingId}`);
    }
    if (!recipient || recipient.trim().length === 0) {
      throw new Error('Recipient is required');
    }
    if (!purpose || purpose.trim().length === 0) {
      throw new Error('Sharing purpose is required');
    }

    const sharingId = `share_${uuidv4()}`;
    const now = new Date().toISOString();

    const sharingRecord: DataSharingRecord = {
      sharing_id: sharingId,
      processing_id: processingId,
      recipient: recipient.trim(),
      purpose: purpose.trim(),
      safeguards: [...safeguards],
      data_categories: [...record.data_types],
      timestamp: now,
    };

    // Update the processing record's third_parties
    record.third_parties = [
      ...(record.third_parties ?? []),
      recipient.trim(),
    ];

    // Store sharing record
    const existing = this.sharingRecords.get(processingId) ?? [];
    existing.push(sharingRecord);
    this.sharingRecords.set(processingId, existing);

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.DataShared,
      {
        processing_id: processingId,
        third_parties: [recipient.trim()],
        data_types: record.data_types,
        m: `Data shared with ${recipient.trim()} — purpose: ${purpose.trim()}, safeguards: ${safeguards.join(', ')}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return sharingRecord;
  }

  /** Record a data deletion event */
  async recordDeletion(
    processingId: string,
    reason: string,
    verifiedBy: string,
  ): Promise<DeletionRecord> {
    const record = this.records.get(processingId);
    if (!record) {
      throw new Error(`Processing record not found: ${processingId}`);
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Deletion reason is required');
    }
    if (!verifiedBy || verifiedBy.trim().length === 0) {
      throw new Error('Verified-by identity is required');
    }

    const deletionId = `del_${uuidv4()}`;
    const now = new Date().toISOString();

    const deletionRecord: DeletionRecord = {
      deletion_id: deletionId,
      processing_id: processingId,
      reason: reason.trim(),
      verified_by: verifiedBy.trim(),
      data_categories: [...record.data_types],
      timestamp: now,
    };

    // Update processing record status
    record.compliance_status = ProcessingActivityStatus.DataDeleted;
    record.end_timestamp = now;

    // Store deletion record
    const existing = this.deletionRecords.get(processingId) ?? [];
    existing.push(deletionRecord);
    this.deletionRecords.set(processingId, existing);

    const message = this.formatter.buildProcessingMessage(
      ProcessingOperation.DataDeleted,
      {
        processing_id: processingId,
        user_id: record.user_id,
        data_types: record.data_types,
        m: `Data deleted for processing ${processingId} — reason: ${reason.trim()}, verified by: ${verifiedBy.trim()}`,
      },
    );
    const serialized = HCS19MessageFormatter.serialize(message);
    this.messageLog.push(serialized);

    // Submit to HCS topic
    await this.submitToTopic(serialized);

    return deletionRecord;
  }

  /** Query processing activities with optional filters */
  async queryProcessingActivities(filters?: ProcessingActivityFilters): Promise<DataProcessingRecord[]> {
    let results = Array.from(this.records.values());

    if (!filters) return results;

    if (filters.controller_id) {
      results = results.filter(r => r.agent_id === filters.controller_id);
    }
    if (filters.processor_id) {
      // processor_id maps to agent_id for processor-specific queries
      results = results.filter(r => r.agent_id === filters.processor_id);
    }
    if (filters.status) {
      results = results.filter(r => r.compliance_status === filters.status);
    }
    if (filters.data_category) {
      results = results.filter(r => r.data_types.includes(filters.data_category!));
    }
    if (filters.legal_basis) {
      results = results.filter(r => r.legal_basis === filters.legal_basis);
    }
    if (filters.user_id) {
      results = results.filter(r => r.user_id === filters.user_id);
    }

    return results;
  }

  /** Get a single processing activity by ID (alias for getRecord) */
  async getProcessingRecord(processingId: string): Promise<DataProcessingRecord | null> {
    return this.records.get(processingId) ?? null;
  }

  /** Get all sharing records for a processing activity */
  async getSharingRecords(processingId: string): Promise<DataSharingRecord[]> {
    return this.sharingRecords.get(processingId) ?? [];
  }

  /** Get all deletion records for a processing activity */
  async getDeletionRecords(processingId: string): Promise<DeletionRecord[]> {
    return this.deletionRecords.get(processingId) ?? [];
  }

  /** Get all generated HCS messages (for testing/debugging) */
  getMessageLog(): string[] {
    return [...this.messageLog];
  }
}
