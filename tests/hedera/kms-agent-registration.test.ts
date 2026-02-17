/**
 * Sprint 34 Tests — KMS Agent Registration.
 *
 * Tests for:
 * - Full KMS-backed agent registration flow
 * - Agent transaction signing
 * - Key rotation with history
 * - Registration listing and status
 */

import { KMSAgentRegistrationManager } from '../../src/hedera/kms-agent-registration';
import { createMockKMSClient } from '../../src/hedera/mock-kms-client';

describe('KMSAgentRegistrationManager', () => {
  let manager: KMSAgentRegistrationManager;

  beforeEach(() => {
    const client = createMockKMSClient();
    manager = new KMSAgentRegistrationManager(client, 'us-east-1');
  });

  // ==========================================
  // Registration Flow Tests
  // ==========================================

  describe('registerAgentWithKMS', () => {
    test('registers agent with ED25519 key (default)', async () => {
      const result = await manager.registerAgentWithKMS({
        name: 'TestAgent',
        description: 'A test agent',
      });

      expect(result.success).toBe(true);
      expect(result.registration).toBeDefined();
      expect(result.registration!.agentId).toContain('kms-agent-');
      expect(result.registration!.keyId).toBeDefined();
      expect(result.registration!.keyArn).toContain('arn:aws:kms');
      expect(result.registration!.hederaAccountId).toMatch(/^0\.0\.\d+$/);
      expect(result.registration!.publicKey).toBeDefined();
      expect(result.registration!.keySpec).toBe('ECC_NIST_EDWARDS25519');
      expect(result.registration!.registeredAt).toBeDefined();
      expect(result.registration!.rotationHistory).toEqual([]);
    });

    test('registers agent with ECDSA key', async () => {
      const result = await manager.registerAgentWithKMS({
        name: 'ECDSAAgent',
        description: 'ECDSA test agent',
        keySpec: 'ECC_SECG_P256K1',
      });

      expect(result.success).toBe(true);
      expect(result.registration!.keySpec).toBe('ECC_SECG_P256K1');
    });

    test('includes all registration steps', async () => {
      const result = await manager.registerAgentWithKMS({
        name: 'StepsAgent',
        description: 'Tests steps',
      });

      expect(result.steps.length).toBeGreaterThanOrEqual(4);
      expect(result.steps.map(s => s.step)).toEqual(
        expect.arrayContaining(['create_kms_key', 'create_hedera_account', 'register_agent', 'hcs10_registration'])
      );
      expect(result.steps.every(s => s.status === 'completed')).toBe(true);
      expect(result.steps.every(s => s.durationMs >= 0)).toBe(true);
    });

    test('applies custom tags', async () => {
      const result = await manager.registerAgentWithKMS({
        name: 'TaggedAgent',
        description: 'Agent with tags',
        tags: { Environment: 'test', Team: 'alpha' },
      });

      expect(result.success).toBe(true);
    });

    test('assigns unique Hedera account IDs', async () => {
      const r1 = await manager.registerAgentWithKMS({ name: 'Agent1', description: 'First' });
      const r2 = await manager.registerAgentWithKMS({ name: 'Agent2', description: 'Second' });

      expect(r1.registration!.hederaAccountId).not.toBe(r2.registration!.hederaAccountId);
    });

    test('assigns unique agent IDs', async () => {
      const r1 = await manager.registerAgentWithKMS({ name: 'Agent1', description: 'First' });
      const r2 = await manager.registerAgentWithKMS({ name: 'Agent2', description: 'Second' });

      expect(r1.registration!.agentId).not.toBe(r2.registration!.agentId);
    });

    test('handles KMS failure gracefully', async () => {
      const failClient = {
        async createKey() { throw new Error('KMS service unavailable'); },
        async getPublicKey() { throw new Error('KMS service unavailable'); },
        async sign() { throw new Error('KMS service unavailable'); },
      };
      const failManager = new KMSAgentRegistrationManager(failClient, 'us-east-1');

      const result = await failManager.registerAgentWithKMS({
        name: 'FailAgent',
        description: 'Should fail',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create KMS key');
      expect(result.steps.some(s => s.status === 'failed')).toBe(true);
    });
  });

  // ==========================================
  // Transaction Signing Tests
  // ==========================================

  describe('signAgentTransaction', () => {
    test('signs transaction with registered agent key', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'SignAgent', description: 'Signs' });
      const keyId = reg.registration!.keyId;
      const txBytes = new Uint8Array(Buffer.from('transaction-data'));

      const result = await manager.signAgentTransaction(keyId, txBytes);

      expect(result.success).toBe(true);
      expect(result.keyId).toBe(keyId);
      expect(result.signatureHex.length).toBeGreaterThan(0);
      expect(result.algorithm).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('includes txHash when provided', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'TxAgent', description: 'TxHash' });
      const result = await manager.signAgentTransaction(
        reg.registration!.keyId,
        new Uint8Array(32),
        '0xabc123',
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xabc123');
    });

    test('returns failure for non-existent key', async () => {
      const result = await manager.signAgentTransaction(
        'nonexistent-key',
        new Uint8Array(32),
      );

      expect(result.success).toBe(false);
    });

    test('signs multiple transactions', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'MultiSign', description: 'Multi' });

      for (let i = 0; i < 5; i++) {
        const result = await manager.signAgentTransaction(
          reg.registration!.keyId,
          new Uint8Array(Buffer.from(`tx-${i}`)),
        );
        expect(result.success).toBe(true);
      }
    });
  });

  // ==========================================
  // Key Rotation Tests
  // ==========================================

  describe('rotateAgentKey', () => {
    test('rotates key successfully', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'RotateAgent', description: 'Rotate' });
      const agentId = reg.registration!.agentId;
      const oldKeyId = reg.registration!.keyId;

      const result = await manager.rotateAgentKey(agentId);

      expect(result.success).toBe(true);
      expect(result.oldKeyId).toBe(oldKeyId);
      expect(result.newKeyId).toBeDefined();
      expect(result.newKeyId).not.toBe(oldKeyId);
      expect(result.newPublicKey).toBeDefined();
    });

    test('updates registration with new key', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'RotateUpd', description: 'Update' });
      const agentId = reg.registration!.agentId;
      const originalKeyId = reg.registration!.keyId;

      await manager.rotateAgentKey(agentId);

      const updated = manager.getRegistration(agentId);
      expect(updated).toBeDefined();
      expect(updated!.keyId).not.toBe(originalKeyId);
      expect(updated!.lastRotation).toBeDefined();
    });

    test('maintains rotation history', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'HistAgent', description: 'History' });
      const agentId = reg.registration!.agentId;

      await manager.rotateAgentKey(agentId);
      await manager.rotateAgentKey(agentId);

      const updated = manager.getRegistration(agentId);
      expect(updated!.rotationHistory.length).toBe(2);
      expect(updated!.rotationHistory[0].oldKeyId).toBeDefined();
      expect(updated!.rotationHistory[0].newKeyId).toBeDefined();
      expect(updated!.rotationHistory[0].rotatedAt).toBeDefined();
    });

    test('returns failure for non-existent agent', async () => {
      const result = await manager.rotateAgentKey('nonexistent-agent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('can sign with new key after rotation', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'RotateSign', description: 'RS' });
      const agentId = reg.registration!.agentId;

      const rotateResult = await manager.rotateAgentKey(agentId);
      const signResult = await manager.signAgentTransaction(
        rotateResult.newKeyId,
        new Uint8Array(32),
      );

      expect(signResult.success).toBe(true);
    });
  });

  // ==========================================
  // Listing & Status Tests
  // ==========================================

  describe('getRegistration', () => {
    test('returns registration for known agent', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'Known', description: 'K' });
      const result = manager.getRegistration(reg.registration!.agentId);
      expect(result).toBeDefined();
      expect(result!.agentId).toBe(reg.registration!.agentId);
    });

    test('returns undefined for unknown agent', () => {
      expect(manager.getRegistration('unknown')).toBeUndefined();
    });
  });

  describe('listRegistrations', () => {
    test('returns empty list initially', () => {
      expect(manager.listRegistrations()).toEqual([]);
    });

    test('returns all registrations', async () => {
      await manager.registerAgentWithKMS({ name: 'A1', description: 'First' });
      await manager.registerAgentWithKMS({ name: 'A2', description: 'Second' });
      await manager.registerAgentWithKMS({ name: 'A3', description: 'Third' });

      const list = manager.listRegistrations();
      expect(list.length).toBe(3);
    });
  });

  describe('getKeyManager', () => {
    test('returns the internal key manager', () => {
      const km = manager.getKeyManager();
      expect(km).toBeDefined();
      expect(typeof km.listKeys).toBe('function');
      expect(typeof km.getAuditLog).toBe('function');
    });
  });

  describe('getStatus', () => {
    test('returns initial status with zero values', () => {
      const status = manager.getStatus();
      expect(status.totalAgents).toBe(0);
      expect(status.totalKeys).toBe(0);
      expect(status.activeKeys).toBe(0);
      expect(status.totalSignOperations).toBe(0);
    });

    test('reflects registered agents and keys', async () => {
      await manager.registerAgentWithKMS({ name: 'S1', description: 'Status 1' });
      await manager.registerAgentWithKMS({ name: 'S2', description: 'Status 2' });

      const status = manager.getStatus();
      expect(status.totalAgents).toBe(2);
      expect(status.totalKeys).toBe(2);
      expect(status.activeKeys).toBe(2);
    });

    test('includes cost estimate', async () => {
      await manager.registerAgentWithKMS({ name: 'C1', description: 'Cost' });
      const status = manager.getStatus();
      expect(status.costEstimate).toBeDefined();
      expect(status.costEstimate.monthlyKeyStorage).toBe(1);
      expect(status.costEstimate.totalMonthlyEstimate).toBeGreaterThanOrEqual(1);
    });

    test('tracks sign operations', async () => {
      const reg = await manager.registerAgentWithKMS({ name: 'Ops', description: 'Ops' });
      await manager.signAgentTransaction(reg.registration!.keyId, new Uint8Array(32));
      await manager.signAgentTransaction(reg.registration!.keyId, new Uint8Array(32));

      const status = manager.getStatus();
      expect(status.totalSignOperations).toBe(2);
    });
  });
});
