/**
 * Sprint 45 Tests — KMS Module Exports.
 *
 * Tests that the kms/index.ts module correctly exports all expected symbols.
 */

describe('KMS Module Exports', () => {
  test('exports createAWSKMSClient', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.createAWSKMSClient).toBe('function');
  });

  test('exports checkAWSKMSHealth', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.checkAWSKMSHealth).toBe('function');
  });

  test('exports scheduleKeyDeletion', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.scheduleKeyDeletion).toBe('function');
  });

  test('exports describeKey', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.describeKey).toBe('function');
  });

  test('exports MultiKeyManager', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.MultiKeyManager).toBe('function');
  });

  test('exports KMSKeyManager (re-export from hedera)', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.KMSKeyManager).toBe('function');
  });

  test('exports extractPublicKeyFromDER', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.extractPublicKeyFromDER).toBe('function');
  });

  test('exports createKMSKey', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.createKMSKey).toBe('function');
  });

  test('exports getPublicKey', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.getPublicKey).toBe('function');
  });

  test('exports signWithKMS', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.signWithKMS).toBe('function');
  });

  test('exports kmsSignerED25519', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.kmsSignerED25519).toBe('function');
  });

  test('exports kmsSignerECDSA', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.kmsSignerECDSA).toBe('function');
  });

  test('exports createMockKMSClient', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.createMockKMSClient).toBe('function');
  });

  test('exports KMSAgentRegistrationManager', () => {
    const kms = require('../../src/kms');
    expect(typeof kms.KMSAgentRegistrationManager).toBe('function');
  });

  test('createMockKMSClient returns working IKMSClient', async () => {
    const kms = require('../../src/kms');
    const client = kms.createMockKMSClient();

    const key = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
    });
    expect(key.KeyMetadata.KeyId).toBeDefined();

    const pubKey = await client.getPublicKey({ KeyId: key.KeyMetadata.KeyId });
    expect(pubKey.PublicKey).toBeDefined();

    const sig = await client.sign({
      KeyId: key.KeyMetadata.KeyId,
      Message: new Uint8Array(32),
      MessageType: 'RAW',
      SigningAlgorithm: 'ED25519_SHA_512',
    });
    expect(sig.Signature).toBeDefined();
  });
});
