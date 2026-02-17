/**
 * HCS-19 DataProcessingRegistry Tests
 *
 * Tests enhanced processing activity lifecycle: register, share, delete, query.
 * Validates all required fields, data sharing tracking, deletion records,
 * filtering, and HCS message generation.
 */

import {
  HCS19Config,
  ProcessingBasis,
  ProcessingActivityStatus,
  ProcessingActivityFilters,
  RegisterProcessingActivityRequest,
} from '../../src/hcs/hcs19-types';

import { DataProcessingRegistry } from '../../src/hcs/hcs19-privacy-manager';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeActivityRequest(overrides?: Partial<RegisterProcessingActivityRequest>): RegisterProcessingActivityRequest {
  return {
    controller_id: '0.0.123456',
    user_id: 'usr_hash_abc123',
    purpose: 'customer_support',
    legal_basis: ProcessingBasis.Consent,
    data_categories: ['contact_information', 'conversation_history'],
    processing_method: 'llm_analysis',
    retention_period: '2_years',
    security_measures: ['encryption_at_rest', 'access_control'],
    consent_id: 'consent_abc',
    ...overrides,
  };
}

describe('DataProcessingRegistry', () => {
  let registry: DataProcessingRegistry;

  beforeEach(async () => {
    registry = new DataProcessingRegistry(TEST_CONFIG);
    await registry.init('0.0.789102');
  });

  describe('registerProcessingActivity', () => {
    test('creates record with all required fields', async () => {
      const record = await registry.registerProcessingActivity(makeActivityRequest());

      expect(record.processing_id).toMatch(/^proc_/);
      expect(record.user_id).toBe('usr_hash_abc123');
      expect(record.agent_id).toBe('0.0.123456');
      expect(record.purpose).toBe('customer_support');
      expect(record.legal_basis).toBe(ProcessingBasis.Consent);
      expect(record.data_types).toEqual(['contact_information', 'conversation_history']);
      expect(record.processing_method).toBe('llm_analysis');
      expect(record.duration).toBe('2_years');
      expect(record.security_measures).toEqual(['encryption_at_rest', 'access_control']);
      expect(record.consent_id).toBe('consent_abc');
    });

    test('sets start_timestamp to ISO 8601', async () => {
      const record = await registry.registerProcessingActivity(makeActivityRequest());
      expect(record.start_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.end_timestamp).toBe('');
    });

    test('sets compliance_status to active', async () => {
      const record = await registry.registerProcessingActivity(makeActivityRequest());
      expect(record.compliance_status).toBe(ProcessingActivityStatus.Active);
    });

    test('generates unique processing_id', async () => {
      const r1 = await registry.registerProcessingActivity(makeActivityRequest());
      const r2 = await registry.registerProcessingActivity(makeActivityRequest());
      expect(r1.processing_id).not.toBe(r2.processing_id);
    });

    test('throws on empty purpose', async () => {
      await expect(
        registry.registerProcessingActivity(makeActivityRequest({ purpose: '' })),
      ).rejects.toThrow('Processing purpose is required');
    });

    test('throws on empty data_categories', async () => {
      await expect(
        registry.registerProcessingActivity(makeActivityRequest({ data_categories: [] })),
      ).rejects.toThrow('data_categories must be a non-empty array');
    });

    test('throws on empty controller_id', async () => {
      await expect(
        registry.registerProcessingActivity(makeActivityRequest({ controller_id: '' })),
      ).rejects.toThrow('controller_id is required');
    });

    test('generates HCS processing_started message', async () => {
      await registry.registerProcessingActivity(makeActivityRequest());
      const messages = registry.getMessageLog();
      expect(messages.length).toBe(1);
      const parsed = JSON.parse(messages[0]);
      expect(parsed.p).toBe('hcs-19');
      expect(parsed.op).toBe('processing_started');
      expect(parsed.operator_id).toBe('0.0.123456');
    });
  });

  describe('recordDataSharing', () => {
    test('creates sharing record with all fields', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      const sharing = await registry.recordDataSharing(
        activity.processing_id,
        'Analytics Corp',
        'aggregate_analytics',
        ['data_anonymization', 'contractual_obligation'],
      );

      expect(sharing.sharing_id).toMatch(/^share_/);
      expect(sharing.processing_id).toBe(activity.processing_id);
      expect(sharing.recipient).toBe('Analytics Corp');
      expect(sharing.purpose).toBe('aggregate_analytics');
      expect(sharing.safeguards).toEqual(['data_anonymization', 'contractual_obligation']);
      expect(sharing.data_categories).toEqual(['contact_information', 'conversation_history']);
      expect(sharing.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('updates third_parties on processing record', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDataSharing(activity.processing_id, 'Partner A', 'analytics', ['encryption']);
      await registry.recordDataSharing(activity.processing_id, 'Partner B', 'reporting', ['access_control']);

      const record = await registry.getProcessingRecord(activity.processing_id);
      expect(record!.third_parties).toContain('Partner A');
      expect(record!.third_parties).toContain('Partner B');
    });

    test('throws on non-existent processing_id', async () => {
      await expect(
        registry.recordDataSharing('nonexistent', 'Corp', 'analytics', []),
      ).rejects.toThrow('Processing record not found');
    });

    test('throws on empty recipient', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await expect(
        registry.recordDataSharing(activity.processing_id, '', 'analytics', []),
      ).rejects.toThrow('Recipient is required');
    });

    test('throws on empty purpose', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await expect(
        registry.recordDataSharing(activity.processing_id, 'Corp', '', []),
      ).rejects.toThrow('Sharing purpose is required');
    });

    test('generates HCS data_shared message', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDataSharing(activity.processing_id, 'Corp', 'analytics', ['encryption']);
      const messages = registry.getMessageLog();
      const lastMsg = JSON.parse(messages[messages.length - 1]);
      expect(lastMsg.op).toBe('data_shared');
      expect(lastMsg.third_parties).toEqual(['Corp']);
    });

    test('stores sharing records retrievable via getSharingRecords', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDataSharing(activity.processing_id, 'A', 'purpose1', ['s1']);
      await registry.recordDataSharing(activity.processing_id, 'B', 'purpose2', ['s2']);

      const records = await registry.getSharingRecords(activity.processing_id);
      expect(records).toHaveLength(2);
      expect(records[0].recipient).toBe('A');
      expect(records[1].recipient).toBe('B');
    });
  });

  describe('recordDeletion', () => {
    test('creates deletion record with all fields', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      const deletion = await registry.recordDeletion(
        activity.processing_id,
        'User erasure request (GDPR Art 17)',
        'dpo@example.com',
      );

      expect(deletion.deletion_id).toMatch(/^del_/);
      expect(deletion.processing_id).toBe(activity.processing_id);
      expect(deletion.reason).toBe('User erasure request (GDPR Art 17)');
      expect(deletion.verified_by).toBe('dpo@example.com');
      expect(deletion.data_categories).toEqual(['contact_information', 'conversation_history']);
      expect(deletion.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('sets compliance_status to data_deleted', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDeletion(activity.processing_id, 'Erasure request', 'admin');

      const record = await registry.getProcessingRecord(activity.processing_id);
      expect(record!.compliance_status).toBe(ProcessingActivityStatus.DataDeleted);
    });

    test('sets end_timestamp on deletion', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      expect(activity.end_timestamp).toBe('');

      await registry.recordDeletion(activity.processing_id, 'Retention expired', 'system');
      const record = await registry.getProcessingRecord(activity.processing_id);
      expect(record!.end_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('throws on non-existent processing_id', async () => {
      await expect(
        registry.recordDeletion('nonexistent', 'reason', 'admin'),
      ).rejects.toThrow('Processing record not found');
    });

    test('throws on empty reason', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await expect(
        registry.recordDeletion(activity.processing_id, '', 'admin'),
      ).rejects.toThrow('Deletion reason is required');
    });

    test('throws on empty verifiedBy', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await expect(
        registry.recordDeletion(activity.processing_id, 'reason', ''),
      ).rejects.toThrow('Verified-by identity is required');
    });

    test('generates HCS data_deleted message', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDeletion(activity.processing_id, 'Erasure', 'admin');
      const messages = registry.getMessageLog();
      const lastMsg = JSON.parse(messages[messages.length - 1]);
      expect(lastMsg.op).toBe('data_deleted');
    });

    test('stores deletion records retrievable via getDeletionRecords', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDeletion(activity.processing_id, 'Reason 1', 'admin1');

      const records = await registry.getDeletionRecords(activity.processing_id);
      expect(records).toHaveLength(1);
      expect(records[0].reason).toBe('Reason 1');
    });
  });

  describe('queryProcessingActivities', () => {
    test('returns all activities when no filters', async () => {
      await registry.registerProcessingActivity(makeActivityRequest());
      await registry.registerProcessingActivity(makeActivityRequest({ user_id: 'user2' }));

      const results = await registry.queryProcessingActivities();
      expect(results).toHaveLength(2);
    });

    test('filters by controller_id', async () => {
      await registry.registerProcessingActivity(makeActivityRequest({ controller_id: '0.0.111' }));
      await registry.registerProcessingActivity(makeActivityRequest({ controller_id: '0.0.222' }));

      const results = await registry.queryProcessingActivities({ controller_id: '0.0.111' });
      expect(results).toHaveLength(1);
      expect(results[0].agent_id).toBe('0.0.111');
    });

    test('filters by status', async () => {
      const a1 = await registry.registerProcessingActivity(makeActivityRequest());
      await registry.registerProcessingActivity(makeActivityRequest());
      await registry.recordDeletion(a1.processing_id, 'erasure', 'admin');

      const active = await registry.queryProcessingActivities({ status: ProcessingActivityStatus.Active });
      expect(active).toHaveLength(1);

      const deleted = await registry.queryProcessingActivities({ status: ProcessingActivityStatus.DataDeleted });
      expect(deleted).toHaveLength(1);
    });

    test('filters by data_category', async () => {
      await registry.registerProcessingActivity(
        makeActivityRequest({ data_categories: ['email', 'phone'] }),
      );
      await registry.registerProcessingActivity(
        makeActivityRequest({ data_categories: ['location'] }),
      );

      const results = await registry.queryProcessingActivities({ data_category: 'email' });
      expect(results).toHaveLength(1);
      expect(results[0].data_types).toContain('email');
    });

    test('filters by legal_basis', async () => {
      await registry.registerProcessingActivity(
        makeActivityRequest({ legal_basis: ProcessingBasis.Consent }),
      );
      await registry.registerProcessingActivity(
        makeActivityRequest({ legal_basis: ProcessingBasis.LegitimateInterest }),
      );

      const results = await registry.queryProcessingActivities({
        legal_basis: ProcessingBasis.LegitimateInterest,
      });
      expect(results).toHaveLength(1);
    });

    test('filters by user_id', async () => {
      await registry.registerProcessingActivity(makeActivityRequest({ user_id: 'alice' }));
      await registry.registerProcessingActivity(makeActivityRequest({ user_id: 'bob' }));

      const results = await registry.queryProcessingActivities({ user_id: 'alice' });
      expect(results).toHaveLength(1);
      expect(results[0].user_id).toBe('alice');
    });

    test('returns empty array for no matches', async () => {
      await registry.registerProcessingActivity(makeActivityRequest());
      const results = await registry.queryProcessingActivities({ controller_id: '0.0.999999' });
      expect(results).toHaveLength(0);
    });
  });

  describe('getProcessingRecord', () => {
    test('returns record by ID', async () => {
      const activity = await registry.registerProcessingActivity(makeActivityRequest());
      const record = await registry.getProcessingRecord(activity.processing_id);
      expect(record).not.toBeNull();
      expect(record!.processing_id).toBe(activity.processing_id);
    });

    test('returns null for unknown ID', async () => {
      const record = await registry.getProcessingRecord('proc_nonexistent');
      expect(record).toBeNull();
    });
  });
});
