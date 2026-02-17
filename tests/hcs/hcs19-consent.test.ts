/**
 * HCS-19 ConsentManager Tests
 *
 * Tests full consent lifecycle: grant, withdraw, update, verify.
 * Validates all 13 required fields, GDPR/CCPA overlays, expiry logic,
 * and HCS message generation.
 */

import {
  HCS19Config,
  ConsentStatus,
  ProcessingBasis,
  ConsentOperation,
  GrantConsentRequest,
  GDPRFields,
  CCPAFields,
} from '../../src/hcs/hcs19-types';

import { ConsentManager } from '../../src/hcs/hcs19-privacy-manager';
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

describe('ConsentManager', () => {
  let manager: ConsentManager;

  beforeEach(async () => {
    manager = new ConsentManager(TEST_CONFIG);
    await manager.init('0.0.789101', 'EU');
  });

  describe('grantConsent', () => {
    test('creates consent with all 13 required fields populated', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());

      expect(consent.consent_id).toBeTruthy();
      expect(consent.user_id).toBe('usr_hash_abc123');
      expect(consent.agent_id).toBe('0.0.123456');
      expect(consent.jurisdiction).toBe('EU');
      expect(consent.legal_basis).toBe(ProcessingBasis.Consent);
      expect(consent.purposes).toEqual(['customer_support', 'service_improvement']);
      expect(consent.data_types).toEqual(['contact_information', 'conversation_history']);
      expect(consent.consent_method).toBe('explicit_checkbox');
      expect(consent.consent_timestamp).toBeTruthy();
      expect(consent.retention_period).toBe('2_years');
      expect(consent.withdrawal_method).toBe('email_or_chat');
      expect(consent.status).toBe(ConsentStatus.Active);
      expect(consent.notice_reference).toBe('hcs://1/0.0.NOTICE#v1.0');
    });

    test('generates unique consent_id with consent_ prefix', async () => {
      const { consent: c1 } = await manager.grantConsent(makeGrantRequest());
      const { consent: c2 } = await manager.grantConsent(makeGrantRequest());

      expect(c1.consent_id).toMatch(/^consent_/);
      expect(c2.consent_id).toMatch(/^consent_/);
      expect(c1.consent_id).not.toBe(c2.consent_id);
    });

    test('sets status to active', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      expect(consent.status).toBe(ConsentStatus.Active);
    });

    test('sets consent_timestamp to ISO 8601', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      expect(() => new Date(consent.consent_timestamp)).not.toThrow();
      expect(consent.consent_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('calculates expiry from retention_period', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest({ retention_period: '1_year' }));
      expect(consent.expiry_date).toBeTruthy();
      const expiry = new Date(consent.expiry_date!);
      const now = new Date();
      // Should be roughly 365 days from now
      const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(360);
      expect(diffDays).toBeLessThan(370);
    });

    test('attaches GDPR fields when provided', async () => {
      const gdpr: GDPRFields = {
        gdpr_lawful_basis: 'article_6_1_a',
        data_controller: '0.0.123456',
        dpo_contact: 'dpo@example.com',
        retention_justification: 'Service delivery requirement',
        automated_decision_making: false,
      };
      const { consent } = await manager.grantConsent(makeGrantRequest({ gdpr }));
      expect(consent.gdpr).toBeDefined();
      expect(consent.gdpr!.gdpr_lawful_basis).toBe('article_6_1_a');
      expect(consent.gdpr!.dpo_contact).toBe('dpo@example.com');
    });

    test('attaches CCPA fields when provided', async () => {
      const ccpa: CCPAFields = {
        business_purpose: 'Service delivery',
        commercial_purpose: 'None',
        sale_opt_out: true,
        categories_disclosed: ['identifiers'],
        third_party_recipients: [],
        retention_justification: 'Business need',
        consumer_rights_provided: ['access', 'deletion'],
      };
      const { consent } = await manager.grantConsent(
        makeGrantRequest({ jurisdiction: 'US-CA', ccpa }),
      );
      expect(consent.ccpa).toBeDefined();
      expect(consent.ccpa!.sale_opt_out).toBe(true);
    });

    test('throws on empty purposes array', async () => {
      await expect(
        manager.grantConsent(makeGrantRequest({ purposes: [] })),
      ).rejects.toThrow('purposes must be a non-empty array');
    });

    test('throws on empty data_types array', async () => {
      await expect(
        manager.grantConsent(makeGrantRequest({ data_types: [] })),
      ).rejects.toThrow('data_types must be a non-empty array');
    });

    test('stores consent in local registry', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const retrieved = await manager.getConsent(consent.consent_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.consent_id).toBe(consent.consent_id);
    });

    test('returns ConsentReceipt with human-readable summary', async () => {
      const { receipt } = await manager.grantConsent(makeGrantRequest());
      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.operation).toBe(ConsentOperation.ConsentGranted);
      expect(receipt.human_readable).toContain('usr_hash_abc123');
      expect(receipt.topic_id).toBe('0.0.789101');
    });

    test('generates HCS consent_granted message', async () => {
      await manager.grantConsent(makeGrantRequest());
      const messages = manager.getMessageLog();
      expect(messages.length).toBe(1);
      const parsed = JSON.parse(messages[0]);
      expect(parsed.p).toBe('hcs-19');
      expect(parsed.op).toBe('consent_granted');
      expect(parsed.operator_id).toBe('0.0.123456');
    });
  });

  describe('withdrawConsent', () => {
    test('sets status to withdrawn', async () => {
      const { consent: original } = await manager.grantConsent(makeGrantRequest());
      const { consent } = await manager.withdrawConsent(original.consent_id);
      expect(consent.status).toBe(ConsentStatus.Withdrawn);
    });

    test('throws on non-existent consent', async () => {
      await expect(manager.withdrawConsent('nonexistent')).rejects.toThrow(
        'Consent record not found',
      );
    });

    test('throws on already-withdrawn consent', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      await manager.withdrawConsent(consent.consent_id);
      await expect(manager.withdrawConsent(consent.consent_id)).rejects.toThrow(
        'Consent already withdrawn',
      );
    });

    test('returns withdrawal receipt', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const { receipt } = await manager.withdrawConsent(consent.consent_id);
      expect(receipt.operation).toBe(ConsentOperation.ConsentWithdrawn);
      expect(receipt.consent_id).toBe(consent.consent_id);
    });

    test('generates HCS consent_withdrawn message', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      await manager.withdrawConsent(consent.consent_id);
      const messages = manager.getMessageLog();
      expect(messages.length).toBe(2);
      const parsed = JSON.parse(messages[1]);
      expect(parsed.op).toBe('consent_withdrawn');
      expect(parsed.status).toBe('withdrawn');
    });
  });

  describe('updateConsent', () => {
    test('updates purposes', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const { consent: updated } = await manager.updateConsent(consent.consent_id, {
        purposes: ['analytics', 'marketing'],
      });
      expect(updated.purposes).toEqual(['analytics', 'marketing']);
    });

    test('updates data_types', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const { consent: updated } = await manager.updateConsent(consent.consent_id, {
        data_types: ['email_only'],
      });
      expect(updated.data_types).toEqual(['email_only']);
    });

    test('updates retention_period and recalculates expiry', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest({ retention_period: '2_years' }));
      const originalExpiry = consent.expiry_date;

      const { consent: updated } = await manager.updateConsent(consent.consent_id, {
        retention_period: '90_days',
      });
      expect(updated.retention_period).toBe('90_days');
      expect(updated.expiry_date).not.toBe(originalExpiry);
    });

    test('preserves unchanged fields', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const originalMethod = consent.consent_method;
      const originalJurisdiction = consent.jurisdiction;

      await manager.updateConsent(consent.consent_id, { purposes: ['new_purpose'] });

      const retrieved = await manager.getConsent(consent.consent_id);
      expect(retrieved!.consent_method).toBe(originalMethod);
      expect(retrieved!.jurisdiction).toBe(originalJurisdiction);
    });

    test('returns updated receipt', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      const { receipt } = await manager.updateConsent(consent.consent_id, {
        purposes: ['updated'],
      });
      expect(receipt.operation).toBe(ConsentOperation.ConsentUpdated);
    });

    test('throws on non-active consent', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      await manager.withdrawConsent(consent.consent_id);
      await expect(
        manager.updateConsent(consent.consent_id, { purposes: ['new'] }),
      ).rejects.toThrow('Cannot update non-active consent');
    });
  });

  describe('verifyConsent', () => {
    test('returns consented=true for active consent matching purpose', async () => {
      await manager.grantConsent(makeGrantRequest());
      const result = await manager.verifyConsent('usr_hash_abc123', 'customer_support');
      expect(result.consented).toBe(true);
      expect(result.consent).toBeDefined();
      expect(result.receipt).toBeDefined();
    });

    test('returns consented=false for withdrawn consent', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest());
      await manager.withdrawConsent(consent.consent_id);
      const result = await manager.verifyConsent('usr_hash_abc123', 'customer_support');
      expect(result.consented).toBe(false);
    });

    test('returns consented=false for non-existent user', async () => {
      const result = await manager.verifyConsent('unknown_user', 'customer_support');
      expect(result.consented).toBe(false);
    });

    test('returns consented=false for non-matching purpose', async () => {
      await manager.grantConsent(makeGrantRequest({ purposes: ['analytics'] }));
      const result = await manager.verifyConsent('usr_hash_abc123', 'marketing');
      expect(result.consented).toBe(false);
    });

    test('generates HCS consent_verified message on success', async () => {
      await manager.grantConsent(makeGrantRequest());
      await manager.verifyConsent('usr_hash_abc123', 'customer_support');
      const messages = manager.getMessageLog();
      const lastMsg = JSON.parse(messages[messages.length - 1]);
      expect(lastMsg.op).toBe('consent_verified');
    });
  });

  describe('listConsents', () => {
    test('returns all consents for a user', async () => {
      await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
      await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
      await manager.grantConsent(makeGrantRequest({ user_id: 'user2' }));

      const user1Consents = await manager.listConsents('user1');
      expect(user1Consents).toHaveLength(2);
    });

    test('includes withdrawn consents in listing', async () => {
      const { consent } = await manager.grantConsent(makeGrantRequest({ user_id: 'user1' }));
      await manager.withdrawConsent(consent.consent_id);

      const consents = await manager.listConsents('user1');
      expect(consents).toHaveLength(1);
      expect(consents[0].status).toBe(ConsentStatus.Withdrawn);
    });
  });

  describe('listActiveConsents', () => {
    test('filters by agent_id and active status', async () => {
      await manager.grantConsent(makeGrantRequest());
      const { consent: c2 } = await manager.grantConsent(makeGrantRequest());
      await manager.withdrawConsent(c2.consent_id);

      const active = await manager.listActiveConsents('0.0.123456');
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe(ConsentStatus.Active);
    });
  });

  describe('isExpired', () => {
    test('returns true for past expiry_date', () => {
      const consent = {
        expiry_date: '2020-01-01T00:00:00Z',
      } as any;
      expect(manager.isExpired(consent)).toBe(true);
    });

    test('returns false for future expiry_date', () => {
      const consent = {
        expiry_date: '2099-01-01T00:00:00Z',
      } as any;
      expect(manager.isExpired(consent)).toBe(false);
    });

    test('returns false when no expiry_date set', () => {
      const consent = {} as any;
      expect(manager.isExpired(consent)).toBe(false);
    });
  });
});
