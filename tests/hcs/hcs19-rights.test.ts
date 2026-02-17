/**
 * HCS-19 PrivacyRightsHandler Tests
 *
 * Tests privacy rights request lifecycle: submit, process, complete, deny.
 * Validates all RightsType values, compliance deadlines, HCS message generation,
 * and error handling.
 */

import {
  HCS19Config,
  RightsType,
  RightsOperation,
  ProcessingBasis,
} from '../../src/hcs/hcs19-types';

import { PrivacyRightsHandler } from '../../src/hcs/hcs19-privacy-manager';
import { HCS19MessageFormatter } from '../../src/hcs/hcs19-topics';

const TEST_CONFIG: HCS19Config = {
  accountId: '0.0.123456',
  privateKey: 'test-key-not-real',
  network: 'testnet',
  defaultJurisdiction: 'EU',
  defaultTtl: 7776000,
};

function makeRightsRequest(overrides?: Partial<Parameters<PrivacyRightsHandler['submitRequest']>[0]>) {
  return {
    user_id: 'usr_hash_abc123',
    request_type: RightsType.Access,
    jurisdiction: 'EU',
    legal_basis: 'GDPR Article 15',
    verification_method: 'identity_verification',
    fulfillment_method: 'secure_download',
    response_method: 'email',
    ...overrides,
  };
}

describe('PrivacyRightsHandler', () => {
  let handler: PrivacyRightsHandler;

  beforeEach(async () => {
    handler = new PrivacyRightsHandler(TEST_CONFIG);
    await handler.init('0.0.rights_topic');
  });

  // ============================================================
  // submitRequest — all RightsType values
  // ============================================================

  describe('submitRequest', () => {
    test('creates access request with req_ prefix ID', async () => {
      const req = await handler.submitRequest(makeRightsRequest());

      expect(req.request_id).toMatch(/^req_/);
      expect(req.user_id).toBe('usr_hash_abc123');
      expect(req.agent_id).toBe('0.0.123456');
      expect(req.request_type).toBe(RightsType.Access);
      expect(req.jurisdiction).toBe('EU');
      expect(req.status).toBe('pending');
    });

    test('creates erasure request (GDPR Art 17)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        request_type: RightsType.Erasure,
        legal_basis: 'GDPR Article 17',
      }));

      expect(req.request_type).toBe(RightsType.Erasure);
      expect(req.legal_basis).toBe('GDPR Article 17');
      expect(req.status).toBe('pending');
    });

    test('creates rectification request (GDPR Art 16)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        request_type: RightsType.Rectification,
        legal_basis: 'GDPR Article 16',
      }));

      expect(req.request_type).toBe(RightsType.Rectification);
    });

    test('creates data portability request (GDPR Art 20)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        request_type: RightsType.DataPortability,
        legal_basis: 'GDPR Article 20',
      }));

      expect(req.request_type).toBe(RightsType.DataPortability);
    });

    test('creates restrict processing request (GDPR Art 18)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        request_type: RightsType.RestrictProcessing,
        legal_basis: 'GDPR Article 18',
      }));

      expect(req.request_type).toBe(RightsType.RestrictProcessing);
    });

    test('creates object request (GDPR Art 21)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        request_type: RightsType.Object,
        legal_basis: 'GDPR Article 21',
      }));

      expect(req.request_type).toBe(RightsType.Object);
    });

    test('generates unique request IDs', async () => {
      const r1 = await handler.submitRequest(makeRightsRequest());
      const r2 = await handler.submitRequest(makeRightsRequest());

      expect(r1.request_id).not.toBe(r2.request_id);
    });

    test('sets expected_completion based on EU jurisdiction (30 days)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ jurisdiction: 'EU' }));

      const submitted = new Date(req.request_timestamp);
      const deadline = new Date(req.expected_completion);
      const diffDays = Math.round((deadline.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });

    test('sets expected_completion based on US-CA jurisdiction (45 days)', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ jurisdiction: 'US-CA' }));

      const submitted = new Date(req.request_timestamp);
      const deadline = new Date(req.expected_completion);
      const diffDays = Math.round((deadline.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(45);
    });

    test('allows custom expected_completion_days override', async () => {
      const req = await handler.submitRequest(makeRightsRequest({
        expected_completion_days: 7,
      }));

      const submitted = new Date(req.request_timestamp);
      const deadline = new Date(req.expected_completion);
      const diffDays = Math.round((deadline.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    });

    test('generates HCS message on submit', async () => {
      await handler.submitRequest(makeRightsRequest());
      const log = handler.getMessageLog();

      expect(log.length).toBe(1);
      const msg = JSON.parse(log[0]);
      expect(msg.p).toBe('hcs-19');
      expect(msg.op).toBe(RightsOperation.RightsRequest);
      expect(msg.request_type).toBe(RightsType.Access);
    });

    test('stores topic_id from init', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      expect(req.topic_id).toBe('0.0.rights_topic');
    });
  });

  // ============================================================
  // processRequest — status transition to in_progress
  // ============================================================

  describe('processRequest', () => {
    test('transitions status from pending to in_progress', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      const processed = await handler.processRequest(req.request_id);

      expect(processed.status).toBe('in_progress');
      expect(processed.request_id).toBe(req.request_id);
    });

    test('throws for non-existent request ID', async () => {
      await expect(handler.processRequest('req_nonexistent'))
        .rejects.toThrow('Rights request not found');
    });

    test('throws if request already completed', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      await handler.completeRequest(req.request_id);

      await expect(handler.processRequest(req.request_id))
        .rejects.toThrow('Cannot process request with status: completed');
    });

    test('throws if request already denied', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      await handler.denyRequest(req.request_id, 'test reason');

      await expect(handler.processRequest(req.request_id))
        .rejects.toThrow('Cannot process request with status: denied');
    });
  });

  // ============================================================
  // completeRequest — auto-selects correct HCS operation
  // ============================================================

  describe('completeRequest', () => {
    test('completes access request with AccessProvided operation', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ request_type: RightsType.Access }));
      await handler.completeRequest(req.request_id);

      const log = handler.getMessageLog();
      const completionMsg = JSON.parse(log[log.length - 1]);
      expect(completionMsg.op).toBe(RightsOperation.AccessProvided);
    });

    test('completes erasure request with ErasureCompleted operation', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ request_type: RightsType.Erasure }));
      await handler.completeRequest(req.request_id);

      const log = handler.getMessageLog();
      const completionMsg = JSON.parse(log[log.length - 1]);
      expect(completionMsg.op).toBe(RightsOperation.ErasureCompleted);
    });

    test('completes rectification request with RectificationCompleted operation', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ request_type: RightsType.Rectification }));
      await handler.completeRequest(req.request_id);

      const log = handler.getMessageLog();
      const completionMsg = JSON.parse(log[log.length - 1]);
      expect(completionMsg.op).toBe(RightsOperation.RectificationCompleted);
    });

    test('completes portability request with RightsFulfilled operation', async () => {
      const req = await handler.submitRequest(makeRightsRequest({ request_type: RightsType.DataPortability }));
      await handler.completeRequest(req.request_id);

      const log = handler.getMessageLog();
      const completionMsg = JSON.parse(log[log.length - 1]);
      expect(completionMsg.op).toBe(RightsOperation.RightsFulfilled);
    });

    test('sets actual_completion timestamp and status', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      const completed = await handler.completeRequest(req.request_id);

      expect(completed.status).toBe('completed');
      expect(completed.actual_completion).toBeTruthy();
    });

    test('attaches compliance notes when provided', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      const completed = await handler.completeRequest(req.request_id, 'Data exported as JSON');

      expect(completed.compliance_notes).toBe('Data exported as JSON');
    });

    test('throws for non-existent request', async () => {
      await expect(handler.completeRequest('req_nonexistent'))
        .rejects.toThrow('Rights request not found');
    });
  });

  // ============================================================
  // denyRequest
  // ============================================================

  describe('denyRequest', () => {
    test('denies request with reason', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      const denied = await handler.denyRequest(req.request_id, 'Identity verification failed');

      expect(denied.status).toBe('denied');
      expect(denied.compliance_notes).toBe('Identity verification failed');
    });

    test('throws for non-existent request', async () => {
      await expect(handler.denyRequest('req_nonexistent', 'test'))
        .rejects.toThrow('Rights request not found');
    });
  });

  // ============================================================
  // listByUser and listPending
  // ============================================================

  describe('listByUser', () => {
    test('returns all requests for a user', async () => {
      await handler.submitRequest(makeRightsRequest({ user_id: 'user_A' }));
      await handler.submitRequest(makeRightsRequest({ user_id: 'user_A' }));
      await handler.submitRequest(makeRightsRequest({ user_id: 'user_B' }));

      const userARequests = await handler.listByUser('user_A');
      expect(userARequests.length).toBe(2);

      const userBRequests = await handler.listByUser('user_B');
      expect(userBRequests.length).toBe(1);
    });

    test('returns empty array for unknown user', async () => {
      const results = await handler.listByUser('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('listPending', () => {
    test('returns only pending and in_progress requests', async () => {
      const r1 = await handler.submitRequest(makeRightsRequest());
      const r2 = await handler.submitRequest(makeRightsRequest());
      const r3 = await handler.submitRequest(makeRightsRequest());

      await handler.processRequest(r2.request_id);
      await handler.completeRequest(r3.request_id);

      const pending = await handler.listPending();
      expect(pending.length).toBe(2);
      expect(pending.map(r => r.status).sort()).toEqual(['in_progress', 'pending']);
    });
  });

  // ============================================================
  // getComplianceDeadline (static)
  // ============================================================

  describe('getComplianceDeadline', () => {
    test('returns 30 days for EU (GDPR)', () => {
      expect(PrivacyRightsHandler.getComplianceDeadline('EU', RightsType.Access)).toBe(30);
    });

    test('returns 30 days for EU member states', () => {
      expect(PrivacyRightsHandler.getComplianceDeadline('EU-DE', RightsType.Erasure)).toBe(30);
      expect(PrivacyRightsHandler.getComplianceDeadline('EU-FR', RightsType.Rectification)).toBe(30);
    });

    test('returns 45 days for US-CA (CCPA)', () => {
      expect(PrivacyRightsHandler.getComplianceDeadline('US-CA', RightsType.Access)).toBe(45);
    });

    test('returns 30 days as default baseline', () => {
      expect(PrivacyRightsHandler.getComplianceDeadline('IN', RightsType.Access)).toBe(30);
      expect(PrivacyRightsHandler.getComplianceDeadline('BR', RightsType.Erasure)).toBe(30);
    });
  });

  // ============================================================
  // getMessageLog
  // ============================================================

  describe('getMessageLog', () => {
    test('returns empty array initially', () => {
      expect(handler.getMessageLog()).toEqual([]);
    });

    test('accumulates messages for each operation', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      await handler.completeRequest(req.request_id);

      const log = handler.getMessageLog();
      expect(log.length).toBe(2);

      const msgs = log.map(l => JSON.parse(l));
      expect(msgs[0].op).toBe(RightsOperation.RightsRequest);
      expect(msgs[1].op).toBe(RightsOperation.AccessProvided);
    });

    test('all messages have valid HCS-19 format', async () => {
      await handler.submitRequest(makeRightsRequest());

      const log = handler.getMessageLog();
      for (const entry of log) {
        const msg = HCS19MessageFormatter.deserialize(entry);
        expect(msg).not.toBeNull();
        expect(msg!.p).toBe('hcs-19');
        expect(msg!.operator_id).toBe('0.0.123456');
      }
    });

    test('returns a copy, not the internal array', () => {
      const log1 = handler.getMessageLog();
      const log2 = handler.getMessageLog();
      expect(log1).not.toBe(log2);
    });
  });

  // ============================================================
  // getRequest and getRequestStatus
  // ============================================================

  describe('getRequest / getRequestStatus', () => {
    test('returns null for non-existent request', async () => {
      expect(await handler.getRequest('req_nope')).toBeNull();
      expect(await handler.getRequestStatus('req_nope')).toBeNull();
    });

    test('returns stored request by ID', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      const found = await handler.getRequest(req.request_id);

      expect(found).not.toBeNull();
      expect(found!.request_id).toBe(req.request_id);
    });

    test('getRequestStatus tracks lifecycle', async () => {
      const req = await handler.submitRequest(makeRightsRequest());
      expect(await handler.getRequestStatus(req.request_id)).toBe('pending');

      await handler.processRequest(req.request_id);
      expect(await handler.getRequestStatus(req.request_id)).toBe('in_progress');

      await handler.completeRequest(req.request_id);
      expect(await handler.getRequestStatus(req.request_id)).toBe('completed');
    });
  });
});
