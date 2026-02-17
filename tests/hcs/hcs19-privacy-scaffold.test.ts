/**
 * HCS-19 Privacy Compliance Scaffold Tests
 *
 * Verifies that all types compile correctly, all enums have expected values,
 * all classes are importable and constructable, and topic memo parsing works.
 */

import {
  // Enums
  HCS19TopicType,
  ConsentStatus,
  ProcessingBasis,
  RightsType,
  AuditType,
  AuditResult,
  RegulatoryFramework,
  ConsentOperation,
  ProcessingOperation,
  RightsOperation,
  AuditOperation,
  // Interfaces (type-only imports verified by usage)
  UserConsentRecord,
  DataProcessingRecord,
  PrivacyRightsRequest,
  ComplianceAuditRecord,
  GDPRFields,
  CCPAFields,
  DDPFields,
  HCS19Message,
  ConsentMessage,
  ProcessingMessage,
  RightsMessage,
  AuditMessage,
  RetentionMessage,
  HCS19TopicMemo,
  HCS19TopicSet,
  PrivacyComplianceProfile,
  HCS19Config,
  ConsentReceipt,
  GrantConsentRequest,
} from '../../src/hcs/hcs19-types';

import {
  HCS19TopicSetup,
  HCS19MessageFormatter,
} from '../../src/hcs/hcs19-topics';

import {
  ConsentManager,
  DataProcessingRegistry,
  PrivacyRightsHandler,
  ComplianceAuditor,
  frameworkForJurisdiction,
  complianceDeadlineDays,
  gdprArticleForRight,
  ccpaSectionForRight,
} from '../../src/hcs/hcs19-privacy-manager';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

describe('HCS-19 Privacy Scaffold', () => {
  // ============================================================
  // ENUM VERIFICATION
  // ============================================================

  describe('Enums', () => {
    test('HCS19TopicType has all 4 topic types', () => {
      expect(HCS19TopicType.ConsentManagement).toBe(0);
      expect(HCS19TopicType.DataProcessing).toBe(1);
      expect(HCS19TopicType.PrivacyRights).toBe(2);
      expect(HCS19TopicType.ComplianceAudit).toBe(3);
    });

    test('ConsentStatus has all statuses', () => {
      expect(ConsentStatus.Active).toBe('active');
      expect(ConsentStatus.Withdrawn).toBe('withdrawn');
      expect(ConsentStatus.Expired).toBe('expired');
    });

    test('ProcessingBasis has all 6 GDPR Article 6 bases', () => {
      expect(ProcessingBasis.Consent).toBe('consent');
      expect(ProcessingBasis.Contract).toBe('contract');
      expect(ProcessingBasis.LegalObligation).toBe('legal_obligation');
      expect(ProcessingBasis.VitalInterest).toBe('vital_interest');
      expect(ProcessingBasis.PublicTask).toBe('public_task');
      expect(ProcessingBasis.LegitimateInterest).toBe('legitimate_interest');
    });

    test('RightsType has all 7 rights types (GDPR + CCPA)', () => {
      expect(RightsType.Access).toBe('access');
      expect(RightsType.Rectification).toBe('rectification');
      expect(RightsType.Erasure).toBe('erasure');
      expect(RightsType.RestrictProcessing).toBe('restrict_processing');
      expect(RightsType.DataPortability).toBe('data_portability');
      expect(RightsType.Object).toBe('object');
      expect(RightsType.DoNotSell).toBe('do_not_sell');
    });

    test('AuditType has all 3 types', () => {
      expect(AuditType.Internal).toBe('internal');
      expect(AuditType.External).toBe('external');
      expect(AuditType.Regulatory).toBe('regulatory');
    });

    test('AuditResult has all 4 assessment levels', () => {
      expect(AuditResult.Compliant).toBe('compliant');
      expect(AuditResult.NonCompliant).toBe('non_compliant');
      expect(AuditResult.PartiallyCompliant).toBe('partially_compliant');
      expect(AuditResult.NeedsReview).toBe('needs_review');
    });

    test('RegulatoryFramework has all 3 frameworks', () => {
      expect(RegulatoryFramework.GDPR).toBe('gdpr');
      expect(RegulatoryFramework.CCPA).toBe('ccpa');
      expect(RegulatoryFramework.DDP).toBe('ddp');
    });

    test('ConsentOperation has all 4 operations', () => {
      expect(ConsentOperation.ConsentGranted).toBe('consent_granted');
      expect(ConsentOperation.ConsentWithdrawn).toBe('consent_withdrawn');
      expect(ConsentOperation.ConsentUpdated).toBe('consent_updated');
      expect(ConsentOperation.ConsentVerified).toBe('consent_verified');
    });

    test('ProcessingOperation has all 4 operations', () => {
      expect(ProcessingOperation.ProcessingStarted).toBe('processing_started');
      expect(ProcessingOperation.ProcessingCompleted).toBe('processing_completed');
      expect(ProcessingOperation.DataShared).toBe('data_shared');
      expect(ProcessingOperation.DataDeleted).toBe('data_deleted');
    });

    test('RightsOperation has all 5 operations', () => {
      expect(RightsOperation.RightsRequest).toBe('rights_request');
      expect(RightsOperation.RightsFulfilled).toBe('rights_fulfilled');
      expect(RightsOperation.AccessProvided).toBe('access_provided');
      expect(RightsOperation.RectificationCompleted).toBe('rectification_completed');
      expect(RightsOperation.ErasureCompleted).toBe('erasure_completed');
    });

    test('AuditOperation has all 5 operations', () => {
      expect(AuditOperation.ComplianceCheck).toBe('compliance_check');
      expect(AuditOperation.ViolationDetected).toBe('violation_detected');
      expect(AuditOperation.AuditInitiated).toBe('audit_initiated');
      expect(AuditOperation.AuditCompleted).toBe('audit_completed');
      expect(AuditOperation.RetentionCheck).toBe('retention_check');
    });
  });

  // ============================================================
  // TYPE COMPILATION VERIFICATION
  // ============================================================

  describe('Type Compilation', () => {
    test('UserConsentRecord compiles with all 13 required fields', () => {
      const record: UserConsentRecord = {
        consent_id: 'consent_001',
        user_id: 'usr_hash_abc123',
        agent_id: '0.0.123456',
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['customer_support'],
        data_types: ['contact_information'],
        consent_method: 'explicit_checkbox',
        consent_timestamp: new Date().toISOString(),
        retention_period: '2_years',
        withdrawal_method: 'email_or_chat',
        status: ConsentStatus.Active,
        notice_reference: 'hcs://1/0.0.NOTICE#v1.0',
      };
      expect(record.consent_id).toBe('consent_001');
      expect(record.status).toBe(ConsentStatus.Active);
    });

    test('UserConsentRecord supports optional GDPR fields', () => {
      const gdpr: GDPRFields = {
        gdpr_lawful_basis: 'article_6_1_a',
        data_controller: '0.0.123456',
        dpo_contact: 'dpo@example.com',
        retention_justification: 'Service delivery',
        automated_decision_making: false,
      };
      const record: UserConsentRecord = {
        consent_id: 'c1',
        user_id: 'u1',
        agent_id: 'a1',
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['support'],
        data_types: ['email'],
        consent_method: 'checkbox',
        consent_timestamp: new Date().toISOString(),
        retention_period: '1_year',
        withdrawal_method: 'email',
        status: ConsentStatus.Active,
        notice_reference: 'ref',
        gdpr,
      };
      expect(record.gdpr?.gdpr_lawful_basis).toBe('article_6_1_a');
    });

    test('UserConsentRecord supports optional CCPA fields', () => {
      const ccpa: CCPAFields = {
        business_purpose: 'Service delivery',
        commercial_purpose: 'None',
        sale_opt_out: true,
        categories_disclosed: ['identifiers'],
        third_party_recipients: [],
        retention_justification: 'Business need',
        consumer_rights_provided: ['access', 'deletion'],
      };
      const record: UserConsentRecord = {
        consent_id: 'c2',
        user_id: 'u2',
        agent_id: 'a2',
        jurisdiction: 'US-CA',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['support'],
        data_types: ['email'],
        consent_method: 'checkbox',
        consent_timestamp: new Date().toISOString(),
        retention_period: '1_year',
        withdrawal_method: 'email',
        status: ConsentStatus.Active,
        notice_reference: 'ref',
        ccpa,
      };
      expect(record.ccpa?.sale_opt_out).toBe(true);
    });

    test('DataProcessingRecord compiles with all required fields', () => {
      const record: DataProcessingRecord = {
        processing_id: 'proc_001',
        user_id: 'usr_001',
        agent_id: '0.0.123456',
        purpose: 'customer_support',
        legal_basis: ProcessingBasis.Consent,
        data_types: ['conversation_history'],
        processing_method: 'llm_analysis',
        duration: '30_minutes',
        security_measures: ['encryption', 'access_control'],
        start_timestamp: new Date().toISOString(),
        end_timestamp: '',
        compliance_status: 'compliant',
      };
      expect(record.processing_id).toBe('proc_001');
    });

    test('PrivacyRightsRequest compiles with all required fields', () => {
      const request: PrivacyRightsRequest = {
        request_id: 'req_001',
        user_id: 'usr_001',
        agent_id: '0.0.123456',
        request_type: RightsType.Access,
        jurisdiction: 'EU',
        legal_basis: 'GDPR Article 15',
        request_timestamp: new Date().toISOString(),
        verification_method: 'email_verification',
        fulfillment_method: 'secure_download',
        expected_completion: new Date().toISOString(),
        response_method: 'email',
      };
      expect(request.request_type).toBe(RightsType.Access);
    });

    test('ComplianceAuditRecord compiles with all required fields', () => {
      const audit: ComplianceAuditRecord = {
        audit_id: 'audit_001',
        agent_id: '0.0.123456',
        audit_type: AuditType.Internal,
        auditor_id: '0.0.789',
        audit_scope: ['consent_management', 'data_processing'],
        audit_period: {
          start_date: '2026-01-01T00:00:00Z',
          end_date: '2026-02-01T00:00:00Z',
        },
        findings: ['All consents valid'],
        compliance_score: 100,
        violations: [],
        recommendations: ['Continue current practices'],
        follow_up_required: false,
        audit_timestamp: new Date().toISOString(),
      };
      expect(audit.compliance_score).toBe(100);
      expect(audit.violations).toEqual([]);
    });

    test('PrivacyComplianceProfile compiles for HCS-11 integration', () => {
      const profile: PrivacyComplianceProfile = {
        standards: [RegulatoryFramework.GDPR, RegulatoryFramework.CCPA],
        jurisdictions: ['EU', 'US-CA'],
        consent_topic_id: '0.0.789101',
        processing_topic_id: '0.0.789102',
        rights_topic_id: '0.0.789103',
        audit_topic_id: '0.0.789104',
        dpo_contact: 'privacy@opspawn.com',
        privacy_policy_url: 'https://opspawn.com/privacy',
        retention_policy: '2_years_default',
      };
      expect(profile.standards).toContain(RegulatoryFramework.GDPR);
    });

    test('DDPFields compiles for India Digital Data Protection', () => {
      const ddp: DDPFields = {
        collection_method: 'api_integration',
        notification_provided: true,
        purpose_limitation: true,
        data_minimization: true,
        accuracy_measures: ['periodic_review'],
        storage_limitation: '3_years',
        security_measures: ['encryption'],
        accountability_measures: ['audit_trail'],
      };
      expect(ddp.notification_provided).toBe(true);
    });

    test('GrantConsentRequest compiles as ConsentManager input type', () => {
      const request: GrantConsentRequest = {
        user_id: 'usr_001',
        purposes: ['support', 'analytics'],
        data_types: ['email', 'name'],
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        consent_method: 'explicit_checkbox',
        retention_period: '2_years',
        withdrawal_method: 'email',
        notice_reference: 'https://example.com/privacy',
      };
      expect(request.purposes).toHaveLength(2);
    });
  });

  // ============================================================
  // HCS MESSAGE TYPE VERIFICATION
  // ============================================================

  describe('HCS Message Types', () => {
    test('HCS19Message base type compiles', () => {
      const msg: HCS19Message = {
        p: 'hcs-19',
        op: ConsentOperation.ConsentGranted,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Test message',
      };
      expect(msg.p).toBe('hcs-19');
    });

    test('ConsentMessage extends base with consent fields', () => {
      const msg: ConsentMessage = {
        p: 'hcs-19',
        op: ConsentOperation.ConsentGranted,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Consent granted',
        consent_id: 'c1',
        user_id: 'u1',
        purposes: ['support'],
        jurisdiction: 'EU',
      };
      expect(msg.op).toBe(ConsentOperation.ConsentGranted);
      expect(msg.consent_id).toBe('c1');
    });

    test('ProcessingMessage extends base with processing fields', () => {
      const msg: ProcessingMessage = {
        p: 'hcs-19',
        op: ProcessingOperation.ProcessingStarted,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Processing started',
        processing_id: 'p1',
        purpose: 'support',
      };
      expect(msg.processing_id).toBe('p1');
    });

    test('RightsMessage extends base with rights fields', () => {
      const msg: RightsMessage = {
        p: 'hcs-19',
        op: RightsOperation.RightsRequest,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Rights request',
        request_id: 'r1',
        request_type: RightsType.Access,
      };
      expect(msg.request_id).toBe('r1');
    });

    test('AuditMessage extends base with audit fields', () => {
      const msg: AuditMessage = {
        p: 'hcs-19',
        op: AuditOperation.AuditCompleted,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Audit completed',
        audit_id: 'a1',
        compliance_score: 95,
      };
      expect(msg.compliance_score).toBe(95);
    });

    test('RetentionMessage compiles with retention-specific fields', () => {
      const msg: RetentionMessage = {
        p: 'hcs-19',
        op: AuditOperation.RetentionCheck,
        operator_id: '0.0.123456',
        timestamp: new Date().toISOString(),
        m: 'Retention check',
        records_reviewed: 100,
        records_archived: 10,
        records_deleted: 5,
        retention_policies_applied: ['2_year_policy'],
        compliance_status: 'compliant',
        next_review_date: '2026-08-01T00:00:00Z',
      };
      expect(msg.records_reviewed).toBe(100);
    });
  });

  // ============================================================
  // TOPIC SETUP CLASS
  // ============================================================

  describe('HCS19TopicSetup', () => {
    test('is constructable with config', () => {
      const setup = new HCS19TopicSetup(TEST_CONFIG);
      expect(setup).toBeInstanceOf(HCS19TopicSetup);
    });

    test('buildTopicMemo formats correctly', () => {
      const memo = HCS19TopicSetup.buildTopicMemo(
        HCS19TopicType.ConsentManagement,
        '0.0.123456',
        'EU',
        7776000,
      );
      expect(memo).toBe('hcs-19:0:7776000:0:0.0.123456:EU');
    });

    test('buildTopicMemo handles all 4 topic types', () => {
      const types = [
        { type: HCS19TopicType.ConsentManagement, expected: '0' },
        { type: HCS19TopicType.DataProcessing, expected: '1' },
        { type: HCS19TopicType.PrivacyRights, expected: '2' },
        { type: HCS19TopicType.ComplianceAudit, expected: '3' },
      ];
      for (const { type, expected } of types) {
        const memo = HCS19TopicSetup.buildTopicMemo(type, '0.0.999', 'US-CA', 86400);
        expect(memo).toContain(`:${expected}:`);
      }
    });

    test('parseTopicMemo parses valid memo', () => {
      const parsed = HCS19TopicSetup.parseTopicMemo('hcs-19:0:7776000:0:0.0.123456:EU');
      expect(parsed).not.toBeNull();
      expect(parsed!.protocol).toBe('hcs-19');
      expect(parsed!.version).toBe(0);
      expect(parsed!.ttl).toBe(7776000);
      expect(parsed!.topic_type).toBe(HCS19TopicType.ConsentManagement);
      expect(parsed!.agent_account_id).toBe('0.0.123456');
      expect(parsed!.jurisdiction).toBe('EU');
    });

    test('parseTopicMemo returns null for invalid memo', () => {
      expect(HCS19TopicSetup.parseTopicMemo('invalid')).toBeNull();
      expect(HCS19TopicSetup.parseTopicMemo('hcs-10:0:100:0:0.0.1:EU')).toBeNull();
      expect(HCS19TopicSetup.parseTopicMemo('')).toBeNull();
    });

    test('buildTopicMemo and parseTopicMemo round-trip', () => {
      const memo = HCS19TopicSetup.buildTopicMemo(
        HCS19TopicType.PrivacyRights,
        '0.0.555',
        'US-CA',
        3600,
      );
      const parsed = HCS19TopicSetup.parseTopicMemo(memo);
      expect(parsed).not.toBeNull();
      expect(parsed!.topic_type).toBe(HCS19TopicType.PrivacyRights);
      expect(parsed!.agent_account_id).toBe('0.0.555');
      expect(parsed!.jurisdiction).toBe('US-CA');
      expect(parsed!.ttl).toBe(3600);
    });

    test('createTopicSet returns topic set structure', async () => {
      const setup = new HCS19TopicSetup(TEST_CONFIG);
      const topicSet = await setup.createTopicSet('EU');
      expect(topicSet.agent_id).toBe('0.0.123456');
      expect(topicSet.jurisdiction).toBe('EU');
      expect(topicSet.consent_topic_id).toBeTruthy();
      expect(topicSet.processing_topic_id).toBeTruthy();
      expect(topicSet.rights_topic_id).toBeTruthy();
      expect(topicSet.audit_topic_id).toBeTruthy();
      expect(topicSet.created_at).toBeTruthy();
    });
  });

  // ============================================================
  // MESSAGE FORMATTER
  // ============================================================

  describe('HCS19MessageFormatter', () => {
    let formatter: HCS19MessageFormatter;

    beforeEach(() => {
      formatter = new HCS19MessageFormatter('0.0.123456');
    });

    test('is constructable with operator ID', () => {
      expect(formatter).toBeInstanceOf(HCS19MessageFormatter);
    });

    test('buildConsentMessage includes base fields', () => {
      const msg = formatter.buildConsentMessage(ConsentOperation.ConsentGranted, {
        consent_id: 'c1',
        user_id: 'u1',
        m: 'Consent granted',
      });
      expect(msg.p).toBe('hcs-19');
      expect(msg.op).toBe(ConsentOperation.ConsentGranted);
      expect(msg.operator_id).toBe('0.0.123456');
      expect(msg.timestamp).toBeTruthy();
      expect(msg.consent_id).toBe('c1');
    });

    test('buildProcessingMessage includes processing fields', () => {
      const msg = formatter.buildProcessingMessage(ProcessingOperation.ProcessingStarted, {
        processing_id: 'p1',
        m: 'Started',
      });
      expect(msg.op).toBe(ProcessingOperation.ProcessingStarted);
      expect(msg.processing_id).toBe('p1');
    });

    test('buildRightsMessage includes rights fields', () => {
      const msg = formatter.buildRightsMessage(RightsOperation.RightsRequest, {
        request_id: 'r1',
        request_type: RightsType.Erasure,
        m: 'Erasure request',
      });
      expect(msg.op).toBe(RightsOperation.RightsRequest);
      expect(msg.request_type).toBe(RightsType.Erasure);
    });

    test('buildAuditMessage includes audit fields', () => {
      const msg = formatter.buildAuditMessage(AuditOperation.AuditCompleted, {
        audit_id: 'a1',
        compliance_score: 100,
        m: 'Audit done',
      });
      expect(msg.op).toBe(AuditOperation.AuditCompleted);
      expect(msg.compliance_score).toBe(100);
    });

    test('serialize produces valid JSON', () => {
      const msg = formatter.buildConsentMessage(ConsentOperation.ConsentGranted, {
        consent_id: 'c1',
        user_id: 'u1',
        m: 'Test',
      });
      const json = HCS19MessageFormatter.serialize(msg);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.p).toBe('hcs-19');
    });

    test('deserialize recovers message from JSON', () => {
      const msg = formatter.buildConsentMessage(ConsentOperation.ConsentGranted, {
        consent_id: 'c1',
        user_id: 'u1',
        m: 'Test',
      });
      const json = HCS19MessageFormatter.serialize(msg);
      const recovered = HCS19MessageFormatter.deserialize(json);
      expect(recovered).not.toBeNull();
      expect(recovered!.p).toBe('hcs-19');
      expect(recovered!.op).toBe(ConsentOperation.ConsentGranted);
    });

    test('deserialize returns null for invalid JSON', () => {
      expect(HCS19MessageFormatter.deserialize('not json')).toBeNull();
      expect(HCS19MessageFormatter.deserialize('{}')).toBeNull();
      expect(HCS19MessageFormatter.deserialize('{"p":"wrong"}')).toBeNull();
    });

    test('validate passes for complete message', () => {
      const msg = formatter.buildConsentMessage(ConsentOperation.ConsentGranted, {
        consent_id: 'c1',
        user_id: 'u1',
        m: 'Test',
      });
      const result = HCS19MessageFormatter.validate(msg);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validate fails for missing required fields', () => {
      const msg = { p: 'wrong' as any, op: '' as any, operator_id: '', timestamp: '', m: '' };
      const result = HCS19MessageFormatter.validate(msg as HCS19Message);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // MANAGER CLASS CONSTRUCTION
  // ============================================================

  describe('Manager Classes', () => {
    test('ConsentManager is constructable', () => {
      const manager = new ConsentManager(TEST_CONFIG);
      expect(manager).toBeInstanceOf(ConsentManager);
    });

    test('ConsentManager.init works', async () => {
      const manager = new ConsentManager(TEST_CONFIG);
      await manager.init('0.0.789101', 'EU');
      // No throw = success
    });

    test('ConsentManager.getConsent returns null for unknown ID', async () => {
      const manager = new ConsentManager(TEST_CONFIG);
      const result = await manager.getConsent('nonexistent');
      expect(result).toBeNull();
    });

    test('ConsentManager.listConsents returns empty for unknown user', async () => {
      const manager = new ConsentManager(TEST_CONFIG);
      const result = await manager.listConsents('unknown_user');
      expect(result).toEqual([]);
    });

    test('ConsentManager.isExpired detects expired consent', () => {
      const manager = new ConsentManager(TEST_CONFIG);
      const expired: UserConsentRecord = {
        consent_id: 'c1',
        user_id: 'u1',
        agent_id: 'a1',
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['support'],
        data_types: ['email'],
        consent_method: 'checkbox',
        consent_timestamp: '2024-01-01T00:00:00Z',
        retention_period: '1_year',
        withdrawal_method: 'email',
        status: ConsentStatus.Active,
        notice_reference: 'ref',
        expiry_date: '2025-01-01T00:00:00Z', // Past date
      };
      expect(manager.isExpired(expired)).toBe(true);
    });

    test('ConsentManager.isExpired returns false for no expiry', () => {
      const manager = new ConsentManager(TEST_CONFIG);
      const noExpiry: UserConsentRecord = {
        consent_id: 'c1',
        user_id: 'u1',
        agent_id: 'a1',
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['support'],
        data_types: ['email'],
        consent_method: 'checkbox',
        consent_timestamp: '2024-01-01T00:00:00Z',
        retention_period: '1_year',
        withdrawal_method: 'email',
        status: ConsentStatus.Active,
        notice_reference: 'ref',
      };
      expect(manager.isExpired(noExpiry)).toBe(false);
    });

    test('ConsentManager.generateReceipt produces valid receipt', () => {
      const manager = new ConsentManager(TEST_CONFIG);
      const consent: UserConsentRecord = {
        consent_id: 'c1',
        user_id: 'u1',
        agent_id: 'a1',
        jurisdiction: 'EU',
        legal_basis: ProcessingBasis.Consent,
        purposes: ['support'],
        data_types: ['email'],
        consent_method: 'checkbox',
        consent_timestamp: '2026-01-01T00:00:00Z',
        retention_period: '1_year',
        withdrawal_method: 'email',
        status: ConsentStatus.Active,
        notice_reference: 'ref',
      };
      const receipt = manager.generateReceipt(consent, ConsentOperation.ConsentGranted);
      expect(receipt.consent_id).toBe('c1');
      expect(receipt.operation).toBe(ConsentOperation.ConsentGranted);
      expect(receipt.human_readable).toContain('u1');
    });

    test('DataProcessingRegistry is constructable', () => {
      const registry = new DataProcessingRegistry(TEST_CONFIG);
      expect(registry).toBeInstanceOf(DataProcessingRegistry);
    });

    test('DataProcessingRegistry.getRecord returns null for unknown ID', async () => {
      const registry = new DataProcessingRegistry(TEST_CONFIG);
      const result = await registry.getRecord('nonexistent');
      expect(result).toBeNull();
    });

    test('PrivacyRightsHandler is constructable', () => {
      const handler = new PrivacyRightsHandler(TEST_CONFIG);
      expect(handler).toBeInstanceOf(PrivacyRightsHandler);
    });

    test('PrivacyRightsHandler.getComplianceDeadline returns correct days', () => {
      expect(PrivacyRightsHandler.getComplianceDeadline('EU', RightsType.Access)).toBe(30);
      expect(PrivacyRightsHandler.getComplianceDeadline('US-CA', RightsType.Access)).toBe(45);
      expect(PrivacyRightsHandler.getComplianceDeadline('IN', RightsType.Access)).toBe(30);
    });

    test('ComplianceAuditor is constructable', () => {
      const auditor = new ComplianceAuditor(TEST_CONFIG);
      expect(auditor).toBeInstanceOf(ComplianceAuditor);
    });

    test('ComplianceAuditor.listAudits returns empty initially', async () => {
      const auditor = new ComplianceAuditor(TEST_CONFIG);
      const audits = await auditor.listAudits();
      expect(audits).toEqual([]);
    });
  });

  // ============================================================
  // REGULATORY FRAMEWORK MAPPERS
  // ============================================================

  describe('Regulatory Framework Mappers', () => {
    test('frameworkForJurisdiction maps EU to GDPR', () => {
      expect(frameworkForJurisdiction('EU')).toBe(RegulatoryFramework.GDPR);
    });

    test('frameworkForJurisdiction maps US-CA to CCPA', () => {
      expect(frameworkForJurisdiction('US-CA')).toBe(RegulatoryFramework.CCPA);
    });

    test('frameworkForJurisdiction maps IN to DDP', () => {
      expect(frameworkForJurisdiction('IN')).toBe(RegulatoryFramework.DDP);
    });

    test('frameworkForJurisdiction defaults to DDP for unknown', () => {
      expect(frameworkForJurisdiction('JP')).toBe(RegulatoryFramework.DDP);
    });

    test('complianceDeadlineDays returns 30 for GDPR', () => {
      expect(complianceDeadlineDays(RegulatoryFramework.GDPR, RightsType.Access)).toBe(30);
    });

    test('complianceDeadlineDays returns 45 for CCPA', () => {
      expect(complianceDeadlineDays(RegulatoryFramework.CCPA, RightsType.Access)).toBe(45);
    });

    test('complianceDeadlineDays returns 30 for DDP', () => {
      expect(complianceDeadlineDays(RegulatoryFramework.DDP, RightsType.Access)).toBe(30);
    });

    test('gdprArticleForRight maps all GDPR rights', () => {
      expect(gdprArticleForRight(RightsType.Access)).toBe('GDPR Article 15');
      expect(gdprArticleForRight(RightsType.Rectification)).toBe('GDPR Article 16');
      expect(gdprArticleForRight(RightsType.Erasure)).toBe('GDPR Article 17');
      expect(gdprArticleForRight(RightsType.RestrictProcessing)).toBe('GDPR Article 18');
      expect(gdprArticleForRight(RightsType.DataPortability)).toBe('GDPR Article 20');
      expect(gdprArticleForRight(RightsType.Object)).toBe('GDPR Article 21');
    });

    test('ccpaSectionForRight maps CCPA rights', () => {
      expect(ccpaSectionForRight(RightsType.Access)).toBe('CCPA §1798.100');
      expect(ccpaSectionForRight(RightsType.Erasure)).toBe('CCPA §1798.105');
      expect(ccpaSectionForRight(RightsType.DoNotSell)).toBe('CCPA §1798.120');
    });
  });
});
