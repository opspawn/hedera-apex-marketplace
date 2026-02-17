/**
 * HCS-19 End-to-End GDPR Lifecycle Tests
 *
 * Demonstrates the full privacy compliance flow:
 * ConsentManager → DataProcessingRegistry → PrivacyRightsHandler → ComplianceAuditor
 *
 * All four managers working together in realistic GDPR scenarios.
 */

import {
  HCS19Config,
  ConsentStatus,
  ProcessingBasis,
  RightsType,
  RightsOperation,
  AuditResult,
  AuditOperation,
  GrantConsentRequest,
} from '../../src/hcs/hcs19-types';

import {
  ConsentManager,
  DataProcessingRegistry,
  PrivacyRightsHandler,
  ComplianceAuditor,
} from '../../src/hcs/hcs19-privacy-manager';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeGDPRConsentRequest(userId: string): GrantConsentRequest {
  return {
    user_id: userId,
    purposes: ['analytics', 'personalization'],
    data_types: ['profile_data', 'usage_data', 'preferences'],
    jurisdiction: 'EU',
    legal_basis: ProcessingBasis.Consent,
    consent_method: 'explicit_checkbox',
    retention_period: '2_years',
    withdrawal_method: 'self_service_portal',
    notice_reference: 'hcs://1/0.0.NOTICE#v1.0',
    gdpr: {
      gdpr_lawful_basis: 'consent',
      data_controller: '0.0.123456',
      dpo_contact: 'dpo@agent.example',
      retention_justification: 'Required for service delivery',
      automated_decision_making: false,
    },
  };
}

describe('HCS-19 End-to-End GDPR Lifecycle', () => {
  let consentMgr: ConsentManager;
  let processingReg: DataProcessingRegistry;
  let rightsHandler: PrivacyRightsHandler;
  let auditor: ComplianceAuditor;

  beforeEach(async () => {
    consentMgr = new ConsentManager(TEST_CONFIG);
    await consentMgr.init('0.0.consent_topic', 'EU');

    processingReg = new DataProcessingRegistry(TEST_CONFIG);
    await processingReg.init('0.0.processing_topic');

    rightsHandler = new PrivacyRightsHandler(TEST_CONFIG);
    await rightsHandler.init('0.0.rights_topic');

    auditor = new ComplianceAuditor(TEST_CONFIG);
    await auditor.init('0.0.audit_topic');
  });

  test('full GDPR Article 15 Subject Access Request lifecycle', async () => {
    // Step 1: Grant consent under GDPR
    const { consent } = await consentMgr.grantConsent(makeGDPRConsentRequest('user_eu_001'));
    expect(consent.status).toBe(ConsentStatus.Active);
    expect(consent.jurisdiction).toBe('EU');
    expect(consent.gdpr).toBeDefined();

    // Step 2: Register processing activity with that consent
    const processing = await processingReg.registerProcessing({
      user_id: 'user_eu_001',
      purpose: 'analytics',
      legal_basis: ProcessingBasis.Consent,
      data_types: ['profile_data', 'usage_data'],
      processing_method: 'automated_analysis',
      duration: '2_years',
      security_measures: ['encryption_at_rest', 'tls_in_transit'],
      consent_id: consent.consent_id,
    });
    expect(processing.consent_id).toBe(consent.consent_id);

    // Step 3: Submit Article 15 SAR
    const sarRequest = await rightsHandler.submitRequest({
      user_id: 'user_eu_001',
      request_type: RightsType.Access,
      jurisdiction: 'EU',
      legal_basis: 'GDPR Article 15',
      verification_method: 'identity_verification',
      fulfillment_method: 'secure_download',
      response_method: 'email',
    });
    expect(sarRequest.status).toBe('pending');

    // Step 4: Process and complete the SAR
    await rightsHandler.processRequest(sarRequest.request_id);
    const completed = await rightsHandler.completeRequest(
      sarRequest.request_id,
      'Full data export provided via secure portal',
    );
    expect(completed.status).toBe('completed');
    expect(completed.actual_completion).toBeTruthy();

    // Step 5: Run compliance check — should score 100/100
    const audit = await auditor.runComplianceCheck({
      consentManager: consentMgr,
      processingRegistry: processingReg,
      rightsRegistry: rightsHandler,
    });
    expect(audit.compliance_score).toBe(100);
    expect(audit.violations).toHaveLength(0);
    expect(audit.result).toBe(AuditResult.Compliant);

    // Step 6: Verify HCS messages across all managers
    expect(consentMgr.getMessageLog().length).toBeGreaterThanOrEqual(1);
    expect(processingReg.getMessageLog().length).toBeGreaterThanOrEqual(1);
    expect(rightsHandler.getMessageLog().length).toBeGreaterThanOrEqual(2); // submit + complete
    expect(auditor.getMessageLog().length).toBeGreaterThanOrEqual(1);
  });

  test('GDPR Article 17 erasure request with consent withdrawal', async () => {
    // Grant consent, process data, then user requests erasure
    const { consent } = await consentMgr.grantConsent(makeGDPRConsentRequest('user_eu_002'));

    const processing = await processingReg.registerProcessing({
      user_id: 'user_eu_002',
      purpose: 'personalization',
      legal_basis: ProcessingBasis.Consent,
      data_types: ['preferences'],
      processing_method: 'ml_model',
      duration: '1_year',
      security_measures: ['encryption'],
      consent_id: consent.consent_id,
    });

    // User withdraws consent
    const { consent: withdrawn } = await consentMgr.withdrawConsent(consent.consent_id);
    expect(withdrawn.status).toBe(ConsentStatus.Withdrawn);

    // Submit erasure request
    const erasureReq = await rightsHandler.submitRequest({
      user_id: 'user_eu_002',
      request_type: RightsType.Erasure,
      jurisdiction: 'EU',
      legal_basis: 'GDPR Article 17',
      verification_method: 'identity_verification',
      fulfillment_method: 'automated_deletion',
      response_method: 'email',
    });

    // Complete the erasure
    await rightsHandler.completeRequest(erasureReq.request_id, 'All personal data erased');

    // Delete data from processing registry
    await processingReg.deleteData(processing.processing_id, 'user_eu_002', ['preferences']);

    // Verify the rights message uses ErasureCompleted operation
    const rightsLog = rightsHandler.getMessageLog();
    const completionMsg = JSON.parse(rightsLog[rightsLog.length - 1]);
    expect(completionMsg.op).toBe(RightsOperation.ErasureCompleted);
  });

  test('multi-purpose consent with selective rights exercise', async () => {
    // Grant consent for multiple purposes
    const { consent } = await consentMgr.grantConsent(makeGDPRConsentRequest('user_eu_003'));

    // Register two separate processing activities
    await processingReg.registerProcessing({
      user_id: 'user_eu_003',
      purpose: 'analytics',
      legal_basis: ProcessingBasis.Consent,
      data_types: ['usage_data'],
      processing_method: 'aggregation',
      duration: '2_years',
      security_measures: ['encryption'],
      consent_id: consent.consent_id,
    });

    await processingReg.registerProcessing({
      user_id: 'user_eu_003',
      purpose: 'personalization',
      legal_basis: ProcessingBasis.Consent,
      data_types: ['preferences'],
      processing_method: 'ml_model',
      duration: '1_year',
      security_measures: ['encryption'],
      consent_id: consent.consent_id,
    });

    // User objects to processing for personalization (Art 21)
    const objection = await rightsHandler.submitRequest({
      user_id: 'user_eu_003',
      request_type: RightsType.Object,
      jurisdiction: 'EU',
      legal_basis: 'GDPR Article 21',
      verification_method: 'identity_verification',
      fulfillment_method: 'processing_cessation',
      response_method: 'email',
    });

    await rightsHandler.completeRequest(objection.request_id, 'Personalization processing ceased');

    // Consent is still active for analytics
    const verified = await consentMgr.verifyConsent('user_eu_003', 'analytics');
    expect(verified.consented).toBe(true);

    // User records tracked
    const userProcessing = await processingReg.listByUser('user_eu_003');
    expect(userProcessing.length).toBe(2);
  });

  test('CCPA rights request with proper 45-day deadline', async () => {
    // Grant consent under CCPA
    const { consent } = await consentMgr.grantConsent({
      ...makeGDPRConsentRequest('user_ca_001'),
      jurisdiction: 'US-CA',
      legal_basis: ProcessingBasis.Consent,
    });

    // Submit CCPA access request
    const req = await rightsHandler.submitRequest({
      user_id: 'user_ca_001',
      request_type: RightsType.Access,
      jurisdiction: 'US-CA',
      legal_basis: 'CCPA §1798.100',
      verification_method: 'identity_verification',
      fulfillment_method: 'secure_download',
      response_method: 'email',
    });

    // Verify 45-day deadline
    const submitted = new Date(req.request_timestamp);
    const deadline = new Date(req.expected_completion);
    const diffDays = Math.round((deadline.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(45);

    await rightsHandler.completeRequest(req.request_id);

    // Full audit should pass
    const audit = await auditor.runComplianceCheck({
      consentManager: consentMgr,
      processingRegistry: processingReg,
      rightsRegistry: rightsHandler,
    });
    expect(audit.compliance_score).toBe(100);
  });

  test('compliance audit detects issues with pending overdue rights requests', async () => {
    // Grant consent
    await consentMgr.grantConsent(makeGDPRConsentRequest('user_eu_overdue'));

    // Submit a request with artificially short deadline (already past)
    const req = await rightsHandler.submitRequest({
      user_id: 'user_eu_overdue',
      request_type: RightsType.Access,
      jurisdiction: 'EU',
      legal_basis: 'GDPR Article 15',
      verification_method: 'identity_verification',
      fulfillment_method: 'secure_download',
      response_method: 'email',
      expected_completion_days: 0, // Deadline = now (instantly overdue)
    });

    // Wait a tiny bit so deadline is in the past
    await new Promise(resolve => setTimeout(resolve, 10));

    // Run compliance check — should detect overdue request
    const audit = await auditor.runComplianceCheck({
      consentManager: consentMgr,
      processingRegistry: processingReg,
      rightsRegistry: rightsHandler,
    });

    expect(audit.compliance_score).toBeLessThan(100);
    expect(audit.violations.length).toBeGreaterThan(0);
    expect(audit.violations.some(v => v.includes('Overdue'))).toBe(true);
    expect(audit.result).toBe(AuditResult.NonCompliant);
    expect(audit.follow_up_required).toBe(true);
  });

  test('retention check after consent withdrawal', async () => {
    const { consent } = await consentMgr.grantConsent(makeGDPRConsentRequest('user_eu_ret'));
    await consentMgr.withdrawConsent(consent.consent_id);

    const retention = await auditor.runRetentionCheck(consentMgr);

    expect(retention.records_reviewed).toBe(1);
    expect(retention.compliance_status).toBe('compliant');
    expect(retention.p).toBe('hcs-19');
    expect(retention.op).toBe(AuditOperation.RetentionCheck);
  });

  test('all HCS messages across managers are valid HCS-19 format', async () => {
    // Run a full lifecycle
    const { consent } = await consentMgr.grantConsent(makeGDPRConsentRequest('user_validate'));

    await processingReg.registerProcessing({
      user_id: 'user_validate',
      purpose: 'analytics',
      legal_basis: ProcessingBasis.Consent,
      data_types: ['usage_data'],
      processing_method: 'aggregation',
      duration: '1_year',
      security_measures: ['encryption'],
      consent_id: consent.consent_id,
    });

    const req = await rightsHandler.submitRequest({
      user_id: 'user_validate',
      request_type: RightsType.Access,
      jurisdiction: 'EU',
      legal_basis: 'GDPR Article 15',
      verification_method: 'identity_verification',
      fulfillment_method: 'secure_download',
      response_method: 'email',
    });
    await rightsHandler.completeRequest(req.request_id);

    await auditor.runComplianceCheck({
      consentManager: consentMgr,
      processingRegistry: processingReg,
      rightsRegistry: rightsHandler,
    });

    // Collect all messages from all managers
    const allMessages = [
      ...consentMgr.getMessageLog(),
      ...processingReg.getMessageLog(),
      ...rightsHandler.getMessageLog(),
      ...auditor.getMessageLog(),
    ];

    expect(allMessages.length).toBeGreaterThanOrEqual(5);

    for (const entry of allMessages) {
      const parsed = JSON.parse(entry);
      expect(parsed.p).toBe('hcs-19');
      expect(parsed.op).toBeTruthy();
      expect(parsed.operator_id).toBe('0.0.123456');
      expect(parsed.timestamp).toBeTruthy();
    }
  });
});
