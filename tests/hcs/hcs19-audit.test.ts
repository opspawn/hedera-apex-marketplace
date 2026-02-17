/**
 * HCS-19 ComplianceAuditor Tests
 *
 * Tests audit lifecycle: start, record violations, run compliance checks,
 * complete audits, retention checks. Validates HCS message generation
 * and edge cases.
 */

import {
  HCS19Config,
  AuditType,
  AuditResult,
  AuditOperation,
  ConsentStatus,
  ProcessingBasis,
  RightsType,
  GrantConsentRequest,
} from '../../src/hcs/hcs19-types';

import {
  ComplianceAuditor,
  ConsentManager,
  DataProcessingRegistry,
  PrivacyRightsHandler,
} from '../../src/hcs/hcs19-privacy-manager';
import { HCS19MessageFormatter } from '../../src/hcs/hcs19-topics';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeGrantRequest(overrides?: Partial<GrantConsentRequest>): GrantConsentRequest {
  return {
    user_id: 'usr_audit_test',
    purposes: ['analytics'],
    data_types: ['usage_data'],
    jurisdiction: 'EU',
    legal_basis: ProcessingBasis.Consent,
    consent_method: 'explicit_checkbox',
    retention_period: '1_year',
    withdrawal_method: 'email',
    notice_reference: 'hcs://1/0.0.NOTICE#v1.0',
    ...overrides,
  };
}

describe('ComplianceAuditor', () => {
  let auditor: ComplianceAuditor;

  beforeEach(async () => {
    auditor = new ComplianceAuditor(TEST_CONFIG);
    await auditor.init('0.0.audit_topic');
  });

  // ============================================================
  // startAudit
  // ============================================================

  describe('startAudit', () => {
    test('creates audit record with audit_ prefix ID', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent_management', 'data_processing'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      expect(audit.audit_id).toMatch(/^audit_/);
      expect(audit.agent_id).toBe('0.0.123456');
      expect(audit.audit_type).toBe(AuditType.Internal);
      expect(audit.auditor_id).toBe('auditor_001');
      expect(audit.audit_scope).toEqual(['consent_management', 'data_processing']);
      expect(audit.findings).toEqual([]);
      expect(audit.violations).toEqual([]);
      expect(audit.compliance_score).toBe(0);
      expect(audit.follow_up_required).toBe(false);
    });

    test('generates HCS AuditInitiated message', async () => {
      await auditor.startAudit({
        audit_type: AuditType.External,
        auditor_id: 'ext_auditor',
        audit_scope: ['rights_requests'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const log = auditor.getMessageLog();
      expect(log.length).toBe(1);
      const msg = JSON.parse(log[0]);
      expect(msg.op).toBe(AuditOperation.AuditInitiated);
      expect(msg.auditor_id).toBe('ext_auditor');
    });

    test('stores topic_id from init', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent_management'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      expect(audit.topic_id).toBe('0.0.audit_topic');
    });

    test('supports all audit types', async () => {
      for (const auditType of [AuditType.Internal, AuditType.External, AuditType.Regulatory]) {
        const audit = await auditor.startAudit({
          audit_type: auditType,
          auditor_id: 'auditor',
          audit_scope: ['all'],
          period_start: '2026-01-01T00:00:00Z',
          period_end: '2026-01-31T23:59:59Z',
        });
        expect(audit.audit_type).toBe(auditType);
      }
    });
  });

  // ============================================================
  // recordViolation
  // ============================================================

  describe('recordViolation', () => {
    test('adds violations and findings to audit', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const updated = await auditor.recordViolation(
        audit.audit_id,
        ['Missing consent for user X', 'Expired consent still active'],
        ['Consent records incomplete', 'Retention policy not enforced'],
      );

      expect(updated.violations).toHaveLength(2);
      expect(updated.violations).toContain('Missing consent for user X');
      expect(updated.findings).toHaveLength(2);
      expect(updated.findings).toContain('Retention policy not enforced');
    });

    test('generates ViolationDetected HCS message', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      await auditor.recordViolation(audit.audit_id, ['test violation'], ['test finding']);

      const log = auditor.getMessageLog();
      expect(log.length).toBe(2); // AuditInitiated + ViolationDetected
      const msg = JSON.parse(log[1]);
      expect(msg.op).toBe(AuditOperation.ViolationDetected);
    });

    test('throws for non-existent audit', async () => {
      await expect(auditor.recordViolation('audit_nope', ['v'], ['f']))
        .rejects.toThrow('Audit not found');
    });

    test('accumulates violations across multiple calls', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      await auditor.recordViolation(audit.audit_id, ['v1'], ['f1']);
      const updated = await auditor.recordViolation(audit.audit_id, ['v2'], ['f2']);

      expect(updated.violations).toEqual(['v1', 'v2']);
      expect(updated.findings).toEqual(['f1', 'f2']);
    });
  });

  // ============================================================
  // runComplianceCheck — automated scoring
  // ============================================================

  describe('runComplianceCheck', () => {
    let consentMgr: ConsentManager;
    let processingReg: DataProcessingRegistry;
    let rightsHandler: PrivacyRightsHandler;

    beforeEach(async () => {
      consentMgr = new ConsentManager(TEST_CONFIG);
      await consentMgr.init('0.0.consent_topic', 'EU');
      processingReg = new DataProcessingRegistry(TEST_CONFIG);
      await processingReg.init('0.0.processing_topic');
      rightsHandler = new PrivacyRightsHandler(TEST_CONFIG);
      await rightsHandler.init('0.0.rights_topic');
    });

    test('returns 100/100 score with no violations when compliant', async () => {
      await consentMgr.grantConsent(makeGrantRequest());

      const audit = await auditor.runComplianceCheck({
        consentManager: consentMgr,
        processingRegistry: processingReg,
        rightsRegistry: rightsHandler,
      });

      expect(audit.compliance_score).toBe(100);
      expect(audit.violations).toHaveLength(0);
      expect(audit.result).toBe(AuditResult.Compliant);
      expect(audit.follow_up_required).toBe(false);
      expect(audit.findings).toContain('No compliance violations detected');
    });

    test('detects no issues with empty system', async () => {
      const audit = await auditor.runComplianceCheck({
        consentManager: consentMgr,
        processingRegistry: processingReg,
        rightsRegistry: rightsHandler,
      });

      expect(audit.compliance_score).toBe(100);
      expect(audit.violations).toHaveLength(0);
    });

    test('generates ComplianceCheck HCS message', async () => {
      await auditor.runComplianceCheck({
        consentManager: consentMgr,
        processingRegistry: processingReg,
        rightsRegistry: rightsHandler,
      });

      const log = auditor.getMessageLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      const msg = JSON.parse(log[log.length - 1]);
      expect(msg.op).toBe(AuditOperation.ComplianceCheck);
      expect(msg.compliance_score).toBeDefined();
    });

    test('audit record has Internal type and correct scope', async () => {
      const audit = await auditor.runComplianceCheck({
        consentManager: consentMgr,
        processingRegistry: processingReg,
        rightsRegistry: rightsHandler,
      });

      expect(audit.audit_type).toBe(AuditType.Internal);
      expect(audit.audit_scope).toContain('consent_management');
      expect(audit.audit_scope).toContain('rights_requests');
      expect(audit.audit_scope).toContain('data_processing');
    });
  });

  // ============================================================
  // completeAudit
  // ============================================================

  describe('completeAudit', () => {
    test('finalizes audit with findings and score', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.External,
        auditor_id: 'ext_001',
        audit_scope: ['all'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const completed = await auditor.completeAudit(audit.audit_id, {
        compliance_score: 95,
        findings: ['All consents properly managed', 'Minor gaps in documentation'],
        violations: [],
        recommendations: ['Improve documentation'],
        follow_up_required: false,
      });

      expect(completed.compliance_score).toBe(95);
      expect(completed.findings).toHaveLength(2);
      expect(completed.violations).toHaveLength(0);
      expect(completed.result).toBe(AuditResult.Compliant);
    });

    test('marks as NonCompliant when violations present', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Regulatory,
        auditor_id: 'reg_001',
        audit_scope: ['all'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const completed = await auditor.completeAudit(audit.audit_id, {
        compliance_score: 40,
        findings: ['Major gaps'],
        violations: ['Missing DPIA', 'No DPO appointed'],
        recommendations: ['Appoint DPO', 'Conduct DPIA'],
        follow_up_required: true,
        follow_up_date: '2026-03-01T00:00:00Z',
      });

      expect(completed.result).toBe(AuditResult.NonCompliant);
      expect(completed.follow_up_required).toBe(true);
      expect(completed.follow_up_date).toBe('2026-03-01T00:00:00Z');
    });

    test('generates AuditCompleted HCS message', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor_001',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      await auditor.completeAudit(audit.audit_id, {
        compliance_score: 100,
        findings: ['Clean'],
        violations: [],
        recommendations: [],
        follow_up_required: false,
      });

      const log = auditor.getMessageLog();
      const completionMsg = JSON.parse(log[log.length - 1]);
      expect(completionMsg.op).toBe(AuditOperation.AuditCompleted);
      expect(completionMsg.compliance_score).toBe(100);
    });

    test('throws for non-existent audit', async () => {
      await expect(auditor.completeAudit('audit_nope', {
        compliance_score: 100,
        findings: [],
        violations: [],
        recommendations: [],
        follow_up_required: false,
      })).rejects.toThrow('Audit not found');
    });
  });

  // ============================================================
  // runRetentionCheck
  // ============================================================

  describe('runRetentionCheck', () => {
    test('reviews consents and returns retention message', async () => {
      const consentMgr = new ConsentManager(TEST_CONFIG);
      await consentMgr.init('0.0.consent_topic', 'EU');
      await consentMgr.grantConsent(makeGrantRequest());

      const result = await auditor.runRetentionCheck(consentMgr);

      expect(result.p).toBe('hcs-19');
      expect(result.op).toBe(AuditOperation.RetentionCheck);
      expect(result.records_reviewed).toBe(1);
      expect(result.records_archived).toBe(0);
      expect(result.records_deleted).toBe(0);
      expect(result.compliance_status).toBe('compliant');
      expect(result.next_review_date).toBeTruthy();
      expect(result.retention_policies_applied).toContain('consent_expiry_check');
    });

    test('schedules next review 90 days out', async () => {
      const consentMgr = new ConsentManager(TEST_CONFIG);
      await consentMgr.init('0.0.consent_topic', 'EU');

      const result = await auditor.runRetentionCheck(consentMgr);

      const nextReview = new Date(result.next_review_date);
      const now = new Date();
      const diffDays = Math.round((nextReview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(91);
    });

    test('generates HCS message for retention check', async () => {
      const consentMgr = new ConsentManager(TEST_CONFIG);
      await consentMgr.init('0.0.consent_topic', 'EU');

      await auditor.runRetentionCheck(consentMgr);

      const log = auditor.getMessageLog();
      expect(log.length).toBe(1);
      const msg = JSON.parse(log[0]);
      expect(msg.op).toBe(AuditOperation.RetentionCheck);
      expect(msg.records_reviewed).toBeDefined();
    });

    test('handles empty consent store', async () => {
      const consentMgr = new ConsentManager(TEST_CONFIG);
      await consentMgr.init('0.0.consent_topic', 'EU');

      const result = await auditor.runRetentionCheck(consentMgr);

      expect(result.records_reviewed).toBe(0);
      expect(result.records_archived).toBe(0);
      expect(result.records_deleted).toBe(0);
    });
  });

  // ============================================================
  // listAudits and getAudit
  // ============================================================

  describe('listAudits / getAudit', () => {
    test('listAudits returns all audits', async () => {
      await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'a1',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });
      await auditor.startAudit({
        audit_type: AuditType.External,
        auditor_id: 'a2',
        audit_scope: ['processing'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const audits = await auditor.listAudits();
      expect(audits.length).toBe(2);
    });

    test('getAudit returns specific audit by ID', async () => {
      const audit = await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'a1',
        audit_scope: ['consent'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const found = await auditor.getAudit(audit.audit_id);
      expect(found).not.toBeNull();
      expect(found!.audit_id).toBe(audit.audit_id);
    });

    test('getAudit returns null for unknown ID', async () => {
      const found = await auditor.getAudit('audit_nope');
      expect(found).toBeNull();
    });
  });

  // ============================================================
  // getMessageLog
  // ============================================================

  describe('getMessageLog', () => {
    test('returns empty array initially', () => {
      expect(auditor.getMessageLog()).toEqual([]);
    });

    test('all messages pass HCS-19 validation', async () => {
      await auditor.startAudit({
        audit_type: AuditType.Internal,
        auditor_id: 'auditor',
        audit_scope: ['all'],
        period_start: '2026-01-01T00:00:00Z',
        period_end: '2026-01-31T23:59:59Z',
      });

      const log = auditor.getMessageLog();
      for (const entry of log) {
        const msg = HCS19MessageFormatter.deserialize(entry);
        expect(msg).not.toBeNull();
        const validation = HCS19MessageFormatter.validate(msg!);
        expect(validation.valid).toBe(true);
      }
    });
  });
});
