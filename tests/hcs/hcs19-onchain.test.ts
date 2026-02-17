/**
 * HCS-19 On-Chain Integration Tests
 *
 * Tests that all 4 managers properly submit messages to HCS topics
 * via the HederaTestnetClient. Uses mock-mode client (no credentials needed)
 * to verify the wiring is correct — messages are actually submitted,
 * sequence numbers are populated on records, and receipts include
 * transaction references.
 */

import {
  HCS19Config,
  ConsentStatus,
  ProcessingBasis,
  ConsentOperation,
  GrantConsentRequest,
  RightsType,
  AuditType,
  HCS19TopicType,
} from '../../src/hcs/hcs19-types';
import { ConsentManager } from '../../src/hcs/hcs19-consent';
import { PrivacyRightsHandler } from '../../src/hcs/hcs19-rights';
import { DataProcessingRegistry } from '../../src/hcs/hcs19-processing';
import { ComplianceAuditor } from '../../src/hcs/hcs19-audit';
import { HCS19TopicSetup } from '../../src/hcs/hcs19-topics';
import { HederaTestnetClient } from '../../src/hedera/client';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeGrantRequest(overrides?: Partial<GrantConsentRequest>): GrantConsentRequest {
  return {
    user_id: 'usr_hash_abc123',
    purposes: ['customer_support', 'service_improvement'],
    data_types: ['contact_information', 'conversation_history'],
    jurisdiction: 'EU',
    legal_basis: ProcessingBasis.Consent,
    consent_method: 'explicit_checkbox',
    retention_period: '2_years',
    withdrawal_method: 'email_or_chat',
    notice_reference: 'hcs://1/0.0.NOTICE#v1.0',
    ...overrides,
  };
}

describe('HCS-19 On-Chain Integration', () => {
  let mockClient: HederaTestnetClient;

  beforeEach(() => {
    // Create a mock-mode client (no real credentials)
    mockClient = new HederaTestnetClient();
    expect(mockClient.isMockMode()).toBe(true);
  });

  afterEach(async () => {
    await mockClient.close();
  });

  describe('HCS19TopicSetup with client', () => {
    test('creates real topics via client instead of placeholder IDs', async () => {
      const setup = new HCS19TopicSetup(TEST_CONFIG, mockClient);
      const topicSet = await setup.createTopicSet('EU');

      // Mock client generates 0.0.800000X topic IDs, not placeholders
      expect(topicSet.consent_topic_id).toMatch(/^0\.0\.\d+$/);
      expect(topicSet.consent_topic_id).not.toContain('placeholder');
      expect(topicSet.processing_topic_id).toMatch(/^0\.0\.\d+$/);
      expect(topicSet.processing_topic_id).not.toContain('placeholder');
      expect(topicSet.rights_topic_id).toMatch(/^0\.0\.\d+$/);
      expect(topicSet.rights_topic_id).not.toContain('placeholder');
      expect(topicSet.audit_topic_id).toMatch(/^0\.0\.\d+$/);
      expect(topicSet.audit_topic_id).not.toContain('placeholder');

      // All 4 topic IDs should be unique
      const ids = [
        topicSet.consent_topic_id,
        topicSet.processing_topic_id,
        topicSet.rights_topic_id,
        topicSet.audit_topic_id,
      ];
      expect(new Set(ids).size).toBe(4);
    });

    test('creates single topic with proper memo', async () => {
      const setup = new HCS19TopicSetup(TEST_CONFIG, mockClient);
      const topicId = await setup.createTopic(HCS19TopicType.ConsentManagement, 'EU', 7776000);
      expect(topicId).toMatch(/^0\.0\.\d+$/);
      expect(topicId).not.toContain('placeholder');
    });

    test('falls back to placeholders without client', async () => {
      const setup = new HCS19TopicSetup(TEST_CONFIG);
      const topicSet = await setup.createTopicSet('EU');
      expect(topicSet.consent_topic_id).toContain('placeholder');
    });
  });

  describe('ConsentManager with HCS client', () => {
    let consentManager: ConsentManager;
    let topicId: string;

    beforeEach(async () => {
      // Create a real topic
      const topicInfo = await mockClient.createTopic('hcs-19:0:7776000:0:0.0.123456:EU');
      topicId = topicInfo.topicId;

      consentManager = new ConsentManager(TEST_CONFIG, mockClient);
      await consentManager.init(topicId, 'EU');
    });

    test('grantConsent submits message to HCS topic and populates sequence_number', async () => {
      const { consent, receipt } = await consentManager.grantConsent(makeGrantRequest());

      // Sequence number should be populated from topic submission
      expect(consent.sequence_number).toBeDefined();
      expect(consent.sequence_number).toBe(1);
      expect(consent.topic_id).toBe(topicId);

      // Receipt should reference the transaction
      expect(receipt.transaction_id).toBeDefined();
      expect(receipt.transaction_id).toContain(topicId);
    });

    test('withdrawConsent submits withdrawal message to HCS', async () => {
      const { consent: original } = await consentManager.grantConsent(makeGrantRequest());
      const { consent, receipt } = await consentManager.withdrawConsent(original.consent_id);

      expect(consent.status).toBe(ConsentStatus.Withdrawn);
      // Second message to same topic => sequence_number 2
      expect(consent.sequence_number).toBe(2);
      expect(receipt.transaction_id).toBeDefined();
    });

    test('revokeConsent submits revocation message to HCS', async () => {
      const { consent: original } = await consentManager.grantConsent(makeGrantRequest());
      const { consent } = await consentManager.revokeConsent(original.consent_id, 'User requested deletion');

      expect(consent.status).toBe(ConsentStatus.Withdrawn);
      expect(consent.sequence_number).toBe(2);
    });

    test('updateConsent submits update message to HCS', async () => {
      const { consent: original } = await consentManager.grantConsent(makeGrantRequest());
      const { consent } = await consentManager.updateConsent(original.consent_id, {
        purposes: ['analytics'],
      });

      expect(consent.purposes).toEqual(['analytics']);
      expect(consent.sequence_number).toBe(2);
    });

    test('verifyConsent submits verification message to HCS', async () => {
      await consentManager.grantConsent(makeGrantRequest());
      const result = await consentManager.verifyConsent('usr_hash_abc123', 'customer_support');

      expect(result.consented).toBe(true);
      // Grant message + verify message = 2 messages
      expect(consentManager.getMessageLog()).toHaveLength(2);
    });

    test('multiple operations produce sequential sequence numbers', async () => {
      const { consent: c1 } = await consentManager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
      const seq1 = c1.sequence_number; // capture before mutation
      const { consent: c2 } = await consentManager.grantConsent(makeGrantRequest({ user_id: 'user2' }));
      const { consent: c3 } = await consentManager.withdrawConsent(c1.consent_id);

      expect(seq1).toBe(1);
      expect(c2.sequence_number).toBe(2);
      // c3 is the same record as c1, now updated with withdrawal sequence
      expect(c3.sequence_number).toBe(3);
    });
  });

  describe('PrivacyRightsHandler with HCS client', () => {
    let rightsHandler: PrivacyRightsHandler;
    let topicId: string;

    beforeEach(async () => {
      const topicInfo = await mockClient.createTopic('hcs-19:0:7776000:2:0.0.123456:EU');
      topicId = topicInfo.topicId;

      rightsHandler = new PrivacyRightsHandler(TEST_CONFIG, mockClient);
      await rightsHandler.init(topicId);
    });

    test('submitRequest submits to HCS and populates sequence_number', async () => {
      const request = await rightsHandler.submitRequest({
        user_id: 'usr_hash_abc123',
        request_type: RightsType.Access,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 15',
        verification_method: 'email_verification',
        fulfillment_method: 'secure_download',
        response_method: 'encrypted_email',
      });

      expect(request.sequence_number).toBeDefined();
      expect(request.sequence_number).toBe(1);
      expect(request.topic_id).toBe(topicId);
    });

    test('completeRequest submits fulfillment message to HCS', async () => {
      const request = await rightsHandler.submitRequest({
        user_id: 'usr_hash_abc123',
        request_type: RightsType.Erasure,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 17',
        verification_method: 'identity_verification',
        fulfillment_method: 'automated_deletion',
        response_method: 'email_confirmation',
      });

      await rightsHandler.processRequest(request.request_id);
      const completed = await rightsHandler.completeRequest(request.request_id, 'All data erased');

      expect(completed.status).toBe('completed');
      expect(completed.sequence_number).toBe(2);
    });

    test('full request lifecycle produces sequential messages', async () => {
      const r1 = await rightsHandler.submitRequest({
        user_id: 'user1',
        request_type: RightsType.Access,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 15',
        verification_method: 'email',
        fulfillment_method: 'download',
        response_method: 'email',
      });

      const r2 = await rightsHandler.submitRequest({
        user_id: 'user2',
        request_type: RightsType.Erasure,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 17',
        verification_method: 'email',
        fulfillment_method: 'automated',
        response_method: 'email',
      });

      expect(r1.sequence_number).toBe(1);
      expect(r2.sequence_number).toBe(2);
    });
  });

  describe('DataProcessingRegistry with HCS client', () => {
    let registry: DataProcessingRegistry;
    let topicId: string;

    beforeEach(async () => {
      const topicInfo = await mockClient.createTopic('hcs-19:0:7776000:1:0.0.123456:EU');
      topicId = topicInfo.topicId;

      registry = new DataProcessingRegistry(TEST_CONFIG, mockClient);
      await registry.init(topicId);
    });

    test('registerProcessing submits to HCS and populates sequence_number', async () => {
      const record = await registry.registerProcessing({
        user_id: 'usr_hash_abc123',
        purpose: 'customer_analytics',
        legal_basis: ProcessingBasis.Consent,
        data_types: ['behavioral_data'],
        processing_method: 'automated_analysis',
        duration: '90_days',
        security_measures: ['encryption', 'access_control'],
      });

      expect(record.sequence_number).toBeDefined();
      expect(record.sequence_number).toBe(1);
      expect(record.topic_id).toBe(topicId);
    });

    test('completeProcessing submits completion to HCS', async () => {
      const record = await registry.registerProcessing({
        user_id: 'usr_hash_abc123',
        purpose: 'analytics',
        legal_basis: ProcessingBasis.Consent,
        data_types: ['data'],
        processing_method: 'auto',
        duration: '30_days',
        security_measures: ['encryption'],
      });

      const completed = await registry.completeProcessing(record.processing_id, 'compliant');
      expect(completed.compliance_status).toBe('compliant');
      expect(completed.sequence_number).toBe(2);
    });

    test('registerProcessingActivity (enhanced) submits to HCS', async () => {
      const record = await registry.registerProcessingActivity({
        controller_id: '0.0.123456',
        user_id: 'usr_hash_abc123',
        purpose: 'recommendation_engine',
        legal_basis: ProcessingBasis.LegitimateInterest,
        data_categories: ['usage_data', 'preferences'],
        processing_method: 'ml_inference',
        retention_period: '1_year',
        security_measures: ['encryption', 'anonymization'],
      });

      expect(record.sequence_number).toBeDefined();
      expect(record.sequence_number).toBe(1);
    });

    test('data sharing and deletion submit to HCS', async () => {
      const record = await registry.registerProcessing({
        user_id: 'usr_hash_abc123',
        purpose: 'analytics',
        legal_basis: ProcessingBasis.Consent,
        data_types: ['data'],
        processing_method: 'auto',
        duration: '30_days',
        security_measures: ['encryption'],
      });

      await registry.shareData(record.processing_id, ['Partner Corp'], ['data']);
      await registry.deleteData(record.processing_id, 'usr_hash_abc123', ['data']);

      // 3 messages: register + share + delete
      expect(registry.getMessageLog()).toHaveLength(3);
    });
  });

  describe('ComplianceAuditor with HCS client', () => {
    let auditor: ComplianceAuditor;
    let topicId: string;

    beforeEach(async () => {
      const topicInfo = await mockClient.createTopic('hcs-19:0:7776000:3:0.0.123456:EU');
      topicId = topicInfo.topicId;

      auditor = new ComplianceAuditor(TEST_CONFIG, mockClient);
      await auditor.init(topicId);
    });

    test('startAudit submits to HCS and populates sequence_number', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: '0.0.123456',
        audit_scope: ['consent_management', 'data_processing'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-02-15T00:00:00Z',
      });

      expect(audit.sequence_number).toBeDefined();
      expect(audit.sequence_number).toBe(1);
      expect(audit.topic_id).toBe(topicId);
    });

    test('completeAudit submits completion to HCS', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.External,
        auditor_id: 'external_auditor_001',
        audit_scope: ['full_compliance'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-02-15T00:00:00Z',
      });

      const completed = await auditor.completeAudit(audit.audit_id, {
        compliance_score: 95,
        findings: ['Minor documentation gap'],
        violations: [],
        recommendations: ['Update privacy policy'],
        follow_up_required: false,
      });

      expect(completed.compliance_score).toBe(95);
      expect(completed.sequence_number).toBe(2);
    });

    test('runComplianceCheck submits automated check to HCS', async () => {
      const consentManager = new ConsentManager(TEST_CONFIG);
      await consentManager.init();
      const processingRegistry = new DataProcessingRegistry(TEST_CONFIG);
      await processingRegistry.init();
      const rightsHandler = new PrivacyRightsHandler(TEST_CONFIG);
      await rightsHandler.init();

      const audit = await auditor.runComplianceCheck({
        consentManager,
        processingRegistry,
        rightsRegistry: rightsHandler,
      });

      expect(audit.sequence_number).toBeDefined();
      expect(audit.sequence_number).toBe(1);
      expect(audit.compliance_score).toBe(100);
    });

    test('recordViolation submits violation to HCS', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: '0.0.123456',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-02-15T00:00:00Z',
      });

      await auditor.recordViolation(
        audit.audit_id,
        ['Expired consent not revoked'],
        ['Found 2 expired consents still marked active'],
      );

      // 2 messages: initiate + violation
      expect(auditor.getMessageLog()).toHaveLength(2);
    });

    test('retention check submits to HCS', async () => {
      const consentManager = new ConsentManager(TEST_CONFIG);
      await consentManager.init();

      const retentionMsg = await auditor.runRetentionCheck(consentManager);
      expect(retentionMsg.p).toBe('hcs-19');
      expect(retentionMsg.op).toBe('retention_check');
      expect(retentionMsg.records_reviewed).toBeDefined();
    });
  });

  describe('End-to-end: full privacy compliance lifecycle on-chain', () => {
    test('creates topics, grants consent, processes data, handles rights request, runs audit — all on-chain', async () => {
      // 1. Create topic set
      const setup = new HCS19TopicSetup(TEST_CONFIG, mockClient);
      const topicSet = await setup.createTopicSet('EU');

      // 2. Initialize all managers with real client
      const consentMgr = new ConsentManager(TEST_CONFIG, mockClient);
      await consentMgr.init(topicSet.consent_topic_id, 'EU');

      const processingReg = new DataProcessingRegistry(TEST_CONFIG, mockClient);
      await processingReg.init(topicSet.processing_topic_id);

      const rightsHandler = new PrivacyRightsHandler(TEST_CONFIG, mockClient);
      await rightsHandler.init(topicSet.rights_topic_id);

      const auditor = new ComplianceAuditor(TEST_CONFIG, mockClient);
      await auditor.init(topicSet.audit_topic_id);

      // 3. Grant consent
      const { consent } = await consentMgr.grantConsent(makeGrantRequest());
      expect(consent.sequence_number).toBe(1);

      // 4. Register processing under that consent
      const proc = await processingReg.registerProcessing({
        user_id: 'usr_hash_abc123',
        purpose: 'analytics',
        legal_basis: ProcessingBasis.Consent,
        data_types: ['contact_information'],
        processing_method: 'automated',
        duration: '90_days',
        security_measures: ['encryption'],
        consent_id: consent.consent_id,
      });
      expect(proc.sequence_number).toBe(1);
      expect(proc.consent_id).toBe(consent.consent_id);

      // 5. Submit access request
      const accessReq = await rightsHandler.submitRequest({
        user_id: 'usr_hash_abc123',
        request_type: RightsType.Access,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 15',
        verification_method: 'email_verification',
        fulfillment_method: 'secure_download',
        response_method: 'encrypted_email',
      });
      expect(accessReq.sequence_number).toBe(1);

      // 6. Complete the access request
      await rightsHandler.processRequest(accessReq.request_id);
      const completed = await rightsHandler.completeRequest(accessReq.request_id, 'Data provided');
      expect(completed.sequence_number).toBe(2);

      // 7. Run compliance audit
      const audit = await auditor.runComplianceCheck({
        consentManager: consentMgr,
        processingRegistry: processingReg,
        rightsRegistry: rightsHandler,
      });
      expect(audit.sequence_number).toBe(1);
      expect(audit.compliance_score).toBe(100);

      // 8. Verify all managers have message logs
      expect(consentMgr.getMessageLog().length).toBeGreaterThan(0);
      expect(processingReg.getMessageLog().length).toBeGreaterThan(0);
      expect(rightsHandler.getMessageLog().length).toBeGreaterThan(0);
      expect(auditor.getMessageLog().length).toBeGreaterThan(0);

      // 9. Verify all messages are valid HCS-19 JSON
      for (const log of [
        ...consentMgr.getMessageLog(),
        ...processingReg.getMessageLog(),
        ...rightsHandler.getMessageLog(),
        ...auditor.getMessageLog(),
      ]) {
        const parsed = JSON.parse(log);
        expect(parsed.p).toBe('hcs-19');
        expect(parsed.op).toBeTruthy();
        expect(parsed.operator_id).toBe('0.0.123456');
        expect(parsed.timestamp).toBeTruthy();
      }
    });
  });
});
