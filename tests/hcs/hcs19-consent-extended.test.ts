/**
 * HCS-19 ConsentManager Extended Tests
 *
 * Tests revokeConsent (with reason tracking), queryConsent (with filters),
 * and additional createConsent edge cases.
 */

import {
  HCS19Config,
  ConsentStatus,
  ProcessingBasis,
  ConsentOperation,
  GrantConsentRequest,
  ConsentQueryFilters,
} from '../../src/hcs/hcs19-types';

import { ConsentManager } from '../../src/hcs/hcs19-privacy-manager';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeGrantRequest(overrides?: Partial<GrantConsentRequest>): GrantConsentRequest {
  return {
    user_id: 'usr_alice',
    purposes: ['customer_support', 'analytics'],
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

describe('ConsentManager — revokeConsent', () => {
  let manager: ConsentManager;

  beforeEach(async () => {
    manager = new ConsentManager(TEST_CONFIG);
    await manager.init('0.0.789101', 'EU');
  });

  test('sets status to withdrawn with reason', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    const { consent: revoked } = await manager.revokeConsent(consent.consent_id, 'User requested deletion');

    expect(revoked.status).toBe(ConsentStatus.Withdrawn);
    expect(revoked.revocation_reason).toBe('User requested deletion');
  });

  test('records revocation timestamp', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    const before = new Date().toISOString();
    const { consent: revoked } = await manager.revokeConsent(consent.consent_id, 'GDPR Art 7(3)');

    expect(revoked.revocation_timestamp).toBeTruthy();
    expect(revoked.revocation_timestamp! >= before).toBe(true);
  });

  test('throws on non-existent consent', async () => {
    await expect(
      manager.revokeConsent('nonexistent_id', 'some reason'),
    ).rejects.toThrow('Consent record not found');
  });

  test('throws on already-revoked consent', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    await manager.revokeConsent(consent.consent_id, 'first revocation');

    await expect(
      manager.revokeConsent(consent.consent_id, 'second attempt'),
    ).rejects.toThrow('Consent already revoked');
  });

  test('throws on empty reason', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());

    await expect(
      manager.revokeConsent(consent.consent_id, ''),
    ).rejects.toThrow('Revocation reason is required');
  });

  test('throws on whitespace-only reason', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());

    await expect(
      manager.revokeConsent(consent.consent_id, '   '),
    ).rejects.toThrow('Revocation reason is required');
  });

  test('trims whitespace from reason', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    const { consent: revoked } = await manager.revokeConsent(consent.consent_id, '  user request  ');

    expect(revoked.revocation_reason).toBe('user request');
  });

  test('returns ConsentReceipt with withdrawn operation', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    const { receipt } = await manager.revokeConsent(consent.consent_id, 'Data breach response');

    expect(receipt.operation).toBe(ConsentOperation.ConsentWithdrawn);
    expect(receipt.consent_id).toBe(consent.consent_id);
    expect(receipt.receipt_id).toBeTruthy();
  });

  test('generates HCS consent_withdrawn message with reason in memo', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    await manager.revokeConsent(consent.consent_id, 'User opt-out');

    const messages = manager.getMessageLog();
    expect(messages.length).toBe(2); // grant + revoke
    const revokeMsg = JSON.parse(messages[1]);
    expect(revokeMsg.op).toBe('consent_withdrawn');
    expect(revokeMsg.m).toContain('User opt-out');
  });

  test('persists revocation — getConsent reflects revoked state', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    await manager.revokeConsent(consent.consent_id, 'Test reason');

    const retrieved = await manager.getConsent(consent.consent_id);
    expect(retrieved!.status).toBe(ConsentStatus.Withdrawn);
    expect(retrieved!.revocation_reason).toBe('Test reason');
    expect(retrieved!.revocation_timestamp).toBeTruthy();
  });
});

describe('ConsentManager — queryConsent', () => {
  let manager: ConsentManager;

  beforeEach(async () => {
    manager = new ConsentManager(TEST_CONFIG);
    await manager.init('0.0.789101', 'EU');
  });

  test('returns all consents for user when no filters', async () => {
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user2' }));

    const results = await manager.queryConsent('user1');
    expect(results).toHaveLength(2);
  });

  test('returns empty array for unknown user', async () => {
    const results = await manager.queryConsent('nobody');
    expect(results).toHaveLength(0);
  });

  test('filters by status', async () => {
    const { consent: c1 } = await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.revokeConsent(c1.consent_id, 'test');

    const active = await manager.queryConsent('user1', { status: ConsentStatus.Active });
    expect(active).toHaveLength(1);

    const withdrawn = await manager.queryConsent('user1', { status: ConsentStatus.Withdrawn });
    expect(withdrawn).toHaveLength(1);
  });

  test('filters by purpose', async () => {
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', purposes: ['analytics'] }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', purposes: ['marketing'] }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', purposes: ['analytics', 'marketing'] }));

    const analytics = await manager.queryConsent('user1', { purpose: 'analytics' });
    expect(analytics).toHaveLength(2);

    const marketing = await manager.queryConsent('user1', { purpose: 'marketing' });
    expect(marketing).toHaveLength(2);

    const support = await manager.queryConsent('user1', { purpose: 'support' });
    expect(support).toHaveLength(0);
  });

  test('filters by jurisdiction', async () => {
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', jurisdiction: 'EU' }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', jurisdiction: 'US-CA' }));

    const eu = await manager.queryConsent('user1', { jurisdiction: 'EU' });
    expect(eu).toHaveLength(1);
    expect(eu[0].jurisdiction).toBe('EU');
  });

  test('filters by legal_basis', async () => {
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', legal_basis: ProcessingBasis.Consent }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', legal_basis: ProcessingBasis.Contract }));

    const consent = await manager.queryConsent('user1', { legal_basis: ProcessingBasis.Consent });
    expect(consent).toHaveLength(1);
    expect(consent[0].legal_basis).toBe(ProcessingBasis.Consent);
  });

  test('filters by data_type', async () => {
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', data_types: ['email', 'phone'] }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', data_types: ['email'] }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1', data_types: ['phone'] }));

    const email = await manager.queryConsent('user1', { data_type: 'email' });
    expect(email).toHaveLength(2);

    const phone = await manager.queryConsent('user1', { data_type: 'phone' });
    expect(phone).toHaveLength(2);
  });

  test('active_only excludes withdrawn and expired consents', async () => {
    const { consent: c1 } = await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
    await manager.revokeConsent(c1.consent_id, 'test');

    const activeOnly = await manager.queryConsent('user1', { active_only: true });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].status).toBe(ConsentStatus.Active);
  });

  test('combines multiple filters', async () => {
    await manager.grantConsent(makeGrantRequest({
      user_id: 'user1',
      purposes: ['analytics'],
      jurisdiction: 'EU',
    }));
    await manager.grantConsent(makeGrantRequest({
      user_id: 'user1',
      purposes: ['analytics'],
      jurisdiction: 'US-CA',
    }));
    await manager.grantConsent(makeGrantRequest({
      user_id: 'user1',
      purposes: ['marketing'],
      jurisdiction: 'EU',
    }));

    const result = await manager.queryConsent('user1', {
      purpose: 'analytics',
      jurisdiction: 'EU',
    });
    expect(result).toHaveLength(1);
    expect(result[0].purposes).toContain('analytics');
    expect(result[0].jurisdiction).toBe('EU');
  });
});

describe('ConsentManager — createConsent edge cases', () => {
  let manager: ConsentManager;

  beforeEach(async () => {
    manager = new ConsentManager(TEST_CONFIG);
    await manager.init('0.0.789101', 'EU');
  });

  test('throws on missing jurisdiction', async () => {
    await expect(
      manager.grantConsent(makeGrantRequest({ jurisdiction: '' })),
    ).rejects.toThrow('jurisdiction is required');
  });

  test('handles granular_permissions correctly', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest({
      granular_permissions: {
        analytics: true,
        marketing: false,
        personalization: true,
      },
    }));

    expect(consent.granular_permissions).toBeDefined();
    expect(consent.granular_permissions!.analytics).toBe(true);
    expect(consent.granular_permissions!.marketing).toBe(false);
    expect(consent.granular_permissions!.personalization).toBe(true);
  });

  test('handles multiple retention period formats', async () => {
    const { consent: days } = await manager.grantConsent(makeGrantRequest({ retention_period: '90_days' }));
    expect(days.expiry_date).toBeTruthy();
    const daysExpiry = new Date(days.expiry_date!);
    const daysDiff = (daysExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(85);
    expect(daysDiff).toBeLessThan(95);

    const { consent: weeks } = await manager.grantConsent(makeGrantRequest({ retention_period: '4_weeks' }));
    expect(weeks.expiry_date).toBeTruthy();
    const weeksDiff = (new Date(weeks.expiry_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(weeksDiff).toBeGreaterThan(25);
    expect(weeksDiff).toBeLessThan(32);

    const { consent: months } = await manager.grantConsent(makeGrantRequest({ retention_period: '6_months' }));
    expect(months.expiry_date).toBeTruthy();
    const monthsDiff = (new Date(months.expiry_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(monthsDiff).toBeGreaterThan(175);
    expect(monthsDiff).toBeLessThan(185);
  });

  test('assigns topic_id from init', async () => {
    const { consent } = await manager.grantConsent(makeGrantRequest());
    expect(consent.topic_id).toBe('0.0.789101');
  });

  test('consent without topic_id when not initialized with one', async () => {
    const uninitManager = new ConsentManager(TEST_CONFIG);
    await uninitManager.init();
    const { consent } = await uninitManager.grantConsent(makeGrantRequest());
    expect(consent.topic_id).toBeUndefined();
  });
});
