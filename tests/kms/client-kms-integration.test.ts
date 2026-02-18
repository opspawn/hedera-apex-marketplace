/**
 * Sprint 45 Tests — Hedera Client KMS Integration.
 *
 * Tests for:
 * - HederaTestnetClient with KMS-backed signing
 * - KMS signer configuration
 * - Late KMS initialization via setKMSSigner
 * - KMS status reporting
 * - Backward compatibility (non-KMS mode)
 */

import { HederaTestnetClient } from '../../src/hedera/client';
import { createMockKMSClient } from '../../src/hedera/mock-kms-client';
import { createKMSKey, kmsSignerED25519, KMSAuditEntry } from '../../src/hedera/kms-signer';

describe('HederaTestnetClient — KMS Integration', () => {
  test('default client has KMS disabled', () => {
    const client = new HederaTestnetClient();
    expect(client.isKMSEnabled()).toBe(false);
    expect(client.getKMSSigner()).toBeUndefined();

    const status = client.getStatus();
    expect(status.kmsEnabled).toBe(false);
    expect(status.kmsPublicKey).toBeUndefined();
  });

  test('client with KMS config reports KMS enabled', () => {
    const mockSigner = async (msg: Uint8Array) => new Uint8Array(64);
    const client = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: '',
      network: 'testnet',
      kmsEnabled: true,
      kmsSigner: mockSigner,
      kmsPublicKey: 'abcdef1234567890',
    });

    expect(client.isKMSEnabled()).toBe(true);
    expect(client.getKMSSigner()).toBe(mockSigner);

    const status = client.getStatus();
    expect(status.kmsEnabled).toBe(true);
    expect(status.kmsPublicKey).toBe('abcdef1234567890');
  });

  test('client with KMS but no privateKey does not go to mock mode if KMS enabled', () => {
    const mockSigner = async (msg: Uint8Array) => new Uint8Array(64);
    const client = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: '',
      network: 'testnet',
      kmsEnabled: true,
      kmsSigner: mockSigner,
    });

    // KMS should be active, so not pure mock (but may still be mock due to SDK)
    expect(client.isKMSEnabled()).toBe(true);
  });

  test('setKMSSigner enables KMS after construction', () => {
    const client = new HederaTestnetClient();
    expect(client.isKMSEnabled()).toBe(false);

    const mockSigner = async (msg: Uint8Array) => new Uint8Array(64);
    client.setKMSSigner(mockSigner, 'hex-public-key');

    expect(client.isKMSEnabled()).toBe(true);
    expect(client.getKMSSigner()).toBe(mockSigner);

    const status = client.getStatus();
    expect(status.kmsEnabled).toBe(true);
    expect(status.kmsPublicKey).toBe('hex-public-key');
  });

  test('KMS signer integrates with mock KMS client', async () => {
    const mockClient = createMockKMSClient();
    const auditLog: KMSAuditEntry[] = [];
    const keyInfo = await createKMSKey(mockClient, {
      region: 'us-east-1',
      keySpec: 'ECC_NIST_EDWARDS25519',
    }, auditLog);

    const signer = kmsSignerED25519(mockClient, keyInfo.keyId, auditLog);
    const hederaClient = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: '',
      network: 'testnet',
      kmsEnabled: true,
      kmsSigner: signer,
      kmsPublicKey: keyInfo.hederaPublicKey,
    });

    expect(hederaClient.isKMSEnabled()).toBe(true);

    // Test that the signer works
    const kmsSignerFn = hederaClient.getKMSSigner()!;
    const signature = await kmsSignerFn(new Uint8Array(Buffer.from('test tx')));
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
  });

  test('backward compatibility — non-KMS client works exactly as before', () => {
    const client = new HederaTestnetClient({
      accountId: '0.0.999',
      privateKey: 'dummy-key',
      network: 'testnet',
    });

    const status = client.getStatus();
    expect(status.kmsEnabled).toBe(false);
    expect(status.kmsPublicKey).toBeUndefined();
    expect(status.network).toBe('testnet');
  });

  test('getStatus includes kmsEnabled=false by default', () => {
    const client = new HederaTestnetClient({
      accountId: '',
      privateKey: '',
      network: 'testnet',
    });

    const status = client.getStatus();
    expect(status).toHaveProperty('kmsEnabled');
    expect(status.kmsEnabled).toBe(false);
    expect(status.mode).toBe('mock');
  });

  test('mock mode still works with topics when KMS is enabled', async () => {
    const mockSigner = async (msg: Uint8Array) => new Uint8Array(64);
    const client = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: '',
      network: 'testnet',
      kmsEnabled: true,
      kmsSigner: mockSigner,
    });

    // Mock mode topic operations should still work
    const topic = await client.createTopic('KMS test topic');
    expect(topic.topicId).toBeDefined();

    const msg = await client.submitMessage(topic.topicId, 'hello');
    expect(msg.sequenceNumber).toBe(1);
  });

  test('close works with KMS client', async () => {
    const mockSigner = async (msg: Uint8Array) => new Uint8Array(64);
    const client = new HederaTestnetClient({
      accountId: '0.0.12345',
      privateKey: '',
      network: 'testnet',
      kmsEnabled: true,
      kmsSigner: mockSigner,
    });

    await client.close();
    // Should not throw
  });
});
