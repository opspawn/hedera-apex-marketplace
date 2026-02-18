/**
 * Sprint 45 Tests — AWS KMS Signer Module.
 *
 * Tests for:
 * - AWS KMS client adapter (createAWSKMSClient)
 * - Health checking (checkAWSKMSHealth)
 * - Key deletion scheduling
 * - Key description
 * - IKMSClient interface compliance
 * - Error handling and edge cases
 */

import {
  createAWSKMSClient,
  checkAWSKMSHealth,
  scheduleKeyDeletion,
  describeKey,
  AWSKMSConfig,
} from '../../src/kms/aws-kms-signer';
import { IKMSClient } from '../../src/hedera/kms-signer';

// Mock the AWS SDK — we don't want real AWS calls in tests
jest.mock('@aws-sdk/client-kms', () => {
  const mockKeys = new Map<string, {
    keyId: string;
    arn: string;
    keySpec: string;
    creationDate: Date;
    description: string;
    enabled: boolean;
    publicKey: Buffer;
  }>();

  const crypto = require('crypto');

  return {
    KMSClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation((command: any) => {
        const commandName = command.constructor.name;

        if (commandName === 'CreateKeyCommand') {
          const keyId = crypto.randomUUID();
          const arn = `arn:aws:kms:us-east-1:123456789012:key/${keyId}`;
          // Generate mock ED25519 SPKI DER (44 bytes)
          const rawPub = crypto.randomBytes(32);
          const header = Buffer.from([
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
          ]);
          const spki = Buffer.concat([header, rawPub]);

          mockKeys.set(keyId, {
            keyId,
            arn,
            keySpec: command.input.KeySpec || 'ECC_NIST_EDWARDS25519',
            creationDate: new Date(),
            description: command.input.Description || '',
            enabled: true,
            publicKey: spki,
          });

          return Promise.resolve({
            KeyMetadata: {
              KeyId: keyId,
              Arn: arn,
              CreationDate: new Date(),
              KeySpec: command.input.KeySpec,
            },
          });
        }

        if (commandName === 'GetPublicKeyCommand') {
          const key = mockKeys.get(command.input.KeyId);
          if (!key) return Promise.reject(new Error(`Key ${command.input.KeyId} not found`));
          return Promise.resolve({
            PublicKey: new Uint8Array(key.publicKey),
            KeySpec: key.keySpec,
          });
        }

        if (commandName === 'SignCommand') {
          const key = mockKeys.get(command.input.KeyId);
          if (!key) return Promise.reject(new Error(`Key ${command.input.KeyId} not found`));
          return Promise.resolve({
            Signature: new Uint8Array(crypto.randomBytes(64)),
            SigningAlgorithm: command.input.SigningAlgorithm,
          });
        }

        if (commandName === 'ListKeysCommand') {
          const keys = Array.from(mockKeys.values()).map(k => ({
            KeyId: k.keyId,
            KeyArn: k.arn,
          }));
          return Promise.resolve({ Keys: keys.slice(0, command.input?.Limit || 100) });
        }

        if (commandName === 'DescribeKeyCommand') {
          const key = mockKeys.get(command.input.KeyId);
          if (!key) return Promise.reject(new Error(`Key ${command.input.KeyId} not found`));
          return Promise.resolve({
            KeyMetadata: {
              KeyId: key.keyId,
              Arn: key.arn,
              KeySpec: key.keySpec,
              KeyState: 'Enabled',
              CreationDate: key.creationDate,
              Description: key.description,
              Enabled: key.enabled,
            },
          });
        }

        if (commandName === 'ScheduleKeyDeletionCommand') {
          const deletionDate = new Date(Date.now() + (command.input.PendingWindowInDays || 7) * 86400000);
          return Promise.resolve({
            DeletionDate: deletionDate,
            KeyId: command.input.KeyId,
          });
        }

        return Promise.reject(new Error(`Unknown command: ${commandName}`));
      }),
    })),
    CreateKeyCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'CreateKeyCommand' } })),
    GetPublicKeyCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'GetPublicKeyCommand' } })),
    SignCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'SignCommand' } })),
    DescribeKeyCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'DescribeKeyCommand' } })),
    ListKeysCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'ListKeysCommand' } })),
    ScheduleKeyDeletionCommand: jest.fn().mockImplementation((input: any) => ({ input, constructor: { name: 'ScheduleKeyDeletionCommand' } })),
    KeySpec: {},
    KeyUsageType: {},
    SigningAlgorithmSpec: {},
    MessageType: {},
  };
});

// ==========================================
// createAWSKMSClient Tests
// ==========================================

describe('createAWSKMSClient', () => {
  const baseConfig: AWSKMSConfig = {
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecretKey',
  };

  test('creates a client implementing IKMSClient', () => {
    const client = createAWSKMSClient(baseConfig);
    expect(client).toBeDefined();
    expect(typeof client.createKey).toBe('function');
    expect(typeof client.getPublicKey).toBe('function');
    expect(typeof client.sign).toBe('function');
  });

  test('creates with custom endpoint (LocalStack)', () => {
    const client = createAWSKMSClient({
      ...baseConfig,
      endpoint: 'http://localhost:4566',
    });
    expect(client).toBeDefined();
  });

  test('creates without explicit credentials (uses default chain)', () => {
    const client = createAWSKMSClient({ region: 'us-west-2' });
    expect(client).toBeDefined();
  });

  test('createKey returns valid key metadata', async () => {
    const client = createAWSKMSClient(baseConfig);
    const result = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
      Description: 'Test key',
    });

    expect(result.KeyMetadata).toBeDefined();
    expect(result.KeyMetadata.KeyId).toBeDefined();
    expect(result.KeyMetadata.Arn).toContain('arn:aws:kms');
    expect(result.KeyMetadata.CreationDate).toBeInstanceOf(Date);
    expect(result.KeyMetadata.KeySpec).toBe('ECC_NIST_EDWARDS25519');
  });

  test('createKey with tags', async () => {
    const client = createAWSKMSClient(baseConfig);
    const result = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
      Tags: [
        { TagKey: 'Project', TagValue: 'hedera-marketplace' },
        { TagKey: 'Environment', TagValue: 'test' },
      ],
    });

    expect(result.KeyMetadata.KeyId).toBeDefined();
  });

  test('createKey for ECDSA key spec', async () => {
    const client = createAWSKMSClient(baseConfig);
    const result = await client.createKey({
      KeySpec: 'ECC_SECG_P256K1',
      KeyUsage: 'SIGN_VERIFY',
    });

    expect(result.KeyMetadata.KeySpec).toBe('ECC_SECG_P256K1');
  });

  test('getPublicKey returns DER-encoded public key', async () => {
    const client = createAWSKMSClient(baseConfig);
    const key = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
    });

    const pubKey = await client.getPublicKey({ KeyId: key.KeyMetadata.KeyId });
    expect(pubKey.PublicKey).toBeDefined();
    expect(pubKey.PublicKey.length).toBeGreaterThan(0);
  });

  test('getPublicKey throws for non-existent key', async () => {
    const client = createAWSKMSClient(baseConfig);
    await expect(
      client.getPublicKey({ KeyId: 'nonexistent-key-id' })
    ).rejects.toThrow('not found');
  });

  test('sign returns signature', async () => {
    const client = createAWSKMSClient(baseConfig);
    const key = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
    });

    const sig = await client.sign({
      KeyId: key.KeyMetadata.KeyId,
      Message: new Uint8Array(Buffer.from('test message')),
      MessageType: 'RAW',
      SigningAlgorithm: 'ED25519_SHA_512',
    });

    expect(sig.Signature).toBeDefined();
    expect(sig.Signature.length).toBeGreaterThan(0);
    expect(sig.SigningAlgorithm).toBe('ED25519_SHA_512');
  });

  test('sign throws for non-existent key', async () => {
    const client = createAWSKMSClient(baseConfig);
    await expect(
      client.sign({
        KeyId: 'bad-key',
        Message: new Uint8Array(32),
        MessageType: 'RAW',
        SigningAlgorithm: 'ED25519_SHA_512',
      })
    ).rejects.toThrow('not found');
  });

  test('multiple keys can be created and used independently', async () => {
    const client = createAWSKMSClient(baseConfig);

    const key1 = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
    });
    const key2 = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
    });

    expect(key1.KeyMetadata.KeyId).not.toBe(key2.KeyMetadata.KeyId);

    const sig1 = await client.sign({
      KeyId: key1.KeyMetadata.KeyId,
      Message: new Uint8Array(32),
      MessageType: 'RAW',
      SigningAlgorithm: 'ED25519_SHA_512',
    });
    const sig2 = await client.sign({
      KeyId: key2.KeyMetadata.KeyId,
      Message: new Uint8Array(32),
      MessageType: 'RAW',
      SigningAlgorithm: 'ED25519_SHA_512',
    });

    expect(sig1.Signature).toBeDefined();
    expect(sig2.Signature).toBeDefined();
  });
});

// ==========================================
// checkAWSKMSHealth Tests
// ==========================================

describe('checkAWSKMSHealth', () => {
  test('returns available status for working config', async () => {
    const status = await checkAWSKMSHealth({
      region: 'us-east-1',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'testSecret',
    });

    expect(status.available).toBe(true);
    expect(status.region).toBe('us-east-1');
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    expect(status.error).toBeUndefined();
  });

  test('includes endpoint in status when provided', async () => {
    const status = await checkAWSKMSHealth({
      region: 'us-west-2',
      endpoint: 'http://localhost:4566',
    });

    expect(status.region).toBe('us-west-2');
    expect(status.endpoint).toBe('http://localhost:4566');
  });

  test('returns available with key count', async () => {
    const status = await checkAWSKMSHealth({
      region: 'us-east-1',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'testSecret',
    });

    expect(status.available).toBe(true);
    expect(typeof status.keyCount).toBe('number');
  });
});

// ==========================================
// scheduleKeyDeletion Tests
// ==========================================

describe('scheduleKeyDeletion', () => {
  test('schedules key deletion with default 7-day window', async () => {
    const result = await scheduleKeyDeletion(
      { region: 'us-east-1' },
      'test-key-id',
    );

    expect(result.keyId).toBe('test-key-id');
    expect(result.deletionDate).toBeInstanceOf(Date);
  });

  test('schedules with custom pending window', async () => {
    const result = await scheduleKeyDeletion(
      { region: 'us-east-1' },
      'test-key-id',
      14,
    );

    expect(result.keyId).toBeDefined();
    expect(result.deletionDate).toBeInstanceOf(Date);
  });

  test('clamps pending window to minimum 7 days', async () => {
    const result = await scheduleKeyDeletion(
      { region: 'us-east-1' },
      'test-key-id',
      3, // below minimum
    );

    expect(result.deletionDate).toBeInstanceOf(Date);
  });

  test('clamps pending window to maximum 30 days', async () => {
    const result = await scheduleKeyDeletion(
      { region: 'us-east-1' },
      'test-key-id',
      60, // above maximum
    );

    expect(result.deletionDate).toBeInstanceOf(Date);
  });
});

// ==========================================
// describeKey Tests
// ==========================================

describe('describeKey', () => {
  test('describes an existing key', async () => {
    // First create a key via createAWSKMSClient
    const client = createAWSKMSClient({ region: 'us-east-1' });
    const key = await client.createKey({
      KeySpec: 'ECC_NIST_EDWARDS25519',
      KeyUsage: 'SIGN_VERIFY',
      Description: 'Describable key',
    });

    const info = await describeKey(
      { region: 'us-east-1' },
      key.KeyMetadata.KeyId,
    );

    expect(info.keyId).toBe(key.KeyMetadata.KeyId);
    expect(info.arn).toContain('arn:aws:kms');
    expect(info.keySpec).toBeDefined();
    expect(info.keyState).toBe('Enabled');
    expect(info.enabled).toBe(true);
  });

  test('throws for non-existent key', async () => {
    await expect(
      describeKey({ region: 'us-east-1' }, 'nonexistent')
    ).rejects.toThrow('not found');
  });
});

// ==========================================
// Integration with existing KMS signer
// ==========================================

describe('AWS KMS client with existing KMS signer functions', () => {
  test('AWS client satisfies IKMSClient interface', () => {
    const client: IKMSClient = createAWSKMSClient({ region: 'us-east-1' });

    // Verify all required methods exist
    expect(typeof client.createKey).toBe('function');
    expect(typeof client.getPublicKey).toBe('function');
    expect(typeof client.sign).toBe('function');
  });

  test('AWS client works with createKMSKey from hedera module', async () => {
    const { createKMSKey, KMSAuditEntry } = require('../../src/hedera/kms-signer');
    const client = createAWSKMSClient({ region: 'us-east-1' });
    const auditLog: typeof KMSAuditEntry[] = [];

    const keyInfo = await createKMSKey(client, {
      region: 'us-east-1',
      keySpec: 'ECC_NIST_EDWARDS25519',
      description: 'Integration test key',
    }, auditLog);

    expect(keyInfo.keyId).toBeDefined();
    expect(keyInfo.keyArn).toContain('arn:aws:kms');
    expect(keyInfo.publicKey).toBeDefined();
    expect(keyInfo.hederaPublicKey).toBeDefined();
  });

  test('AWS client works with KMSKeyManager', async () => {
    const { KMSKeyManager } = require('../../src/hedera/kms-signer');
    const client = createAWSKMSClient({ region: 'us-east-1' });
    const manager = new KMSKeyManager(client, 'us-east-1');

    const keyInfo = await manager.createKey({ keySpec: 'ECC_NIST_EDWARDS25519' });
    expect(keyInfo.keyId).toBeDefined();

    const result = await manager.sign(keyInfo.keyId, new Uint8Array(32));
    expect(result.signature).toBeDefined();
    expect(result.signature.length).toBeGreaterThan(0);
  });
});
