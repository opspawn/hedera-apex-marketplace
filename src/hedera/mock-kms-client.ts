/**
 * Mock AWS KMS Client for demo and testing.
 *
 * Generates realistic-looking keys and signatures without requiring
 * real AWS credentials. Used in both the demo environment and unit tests.
 */

import * as crypto from 'crypto';
import { IKMSClient } from './kms-signer';

/**
 * ED25519 SPKI DER structure (44 bytes):
 *   30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes public key>
 */
function buildED25519SPKI(publicKey: Buffer): Buffer {
  const header = Buffer.from([
    0x30, 0x2a, // SEQUENCE, 42 bytes
    0x30, 0x05, // SEQUENCE, 5 bytes (AlgorithmIdentifier)
    0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (id-EdDSA)
    0x03, 0x21, 0x00, // BIT STRING, 33 bytes (0x00 padding + 32 bytes key)
  ]);
  return Buffer.concat([header, publicKey]);
}

/**
 * ECDSA secp256k1 SPKI DER structure (91 bytes):
 *   30 56 30 10 06 07 2a 86 48 ce 3d 02 01 06 05 2b 81 04 00 0a
 *   03 42 00 04 <64 bytes uncompressed point>
 */
function buildECDSASPKI(publicKey: Buffer): Buffer {
  const header = Buffer.from([
    0x30, 0x56, // SEQUENCE, 86 bytes
    0x30, 0x10, // SEQUENCE, 16 bytes (AlgorithmIdentifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID 1.2.840.10045.2.1
    0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, // OID 1.3.132.0.10 (secp256k1)
    0x03, 0x42, 0x00, // BIT STRING, 66 bytes
    0x04, // uncompressed point prefix
  ]);
  return Buffer.concat([header, publicKey]);
}

export function createMockKMSClient(): IKMSClient {
  const keyStore = new Map<string, {
    keySpec: string;
    privateKey: Buffer;
    publicKey: Buffer;
    spkiDer: Buffer;
    createdAt: Date;
    arn: string;
  }>();

  return {
    async createKey(params) {
      const keyId = crypto.randomUUID();
      const arn = `arn:aws:kms:us-east-1:123456789012:key/${keyId}`;

      let privateKey: Buffer;
      let publicKey: Buffer;
      let spkiDer: Buffer;

      if (params.KeySpec === 'ECC_NIST_EDWARDS25519') {
        // Generate ED25519 key pair
        const kp = crypto.generateKeyPairSync('ed25519');
        const pubDer = kp.publicKey.export({ type: 'spki', format: 'der' });
        publicKey = Buffer.from(pubDer).slice(-32);
        privateKey = Buffer.from(kp.privateKey.export({ type: 'pkcs8', format: 'der' }));
        spkiDer = buildED25519SPKI(publicKey);
      } else {
        // Generate random 64-byte "uncompressed" ECDSA point for mock
        publicKey = crypto.randomBytes(64);
        privateKey = crypto.randomBytes(32);
        spkiDer = buildECDSASPKI(publicKey);
      }

      const createdAt = new Date();
      keyStore.set(keyId, { keySpec: params.KeySpec, privateKey, publicKey, spkiDer, createdAt, arn });

      // Simulate KMS latency (~50-100ms)
      await new Promise(r => setTimeout(r, 10 + Math.random() * 20));

      return {
        KeyMetadata: {
          KeyId: keyId,
          Arn: arn,
          CreationDate: createdAt,
          KeySpec: params.KeySpec,
        },
      };
    },

    async getPublicKey(params) {
      const key = keyStore.get(params.KeyId);
      if (!key) {
        throw new Error(`Key ${params.KeyId} not found`);
      }

      await new Promise(r => setTimeout(r, 5 + Math.random() * 10));

      return {
        PublicKey: new Uint8Array(key.spkiDer),
        KeySpec: key.keySpec,
      };
    },

    async sign(params) {
      const key = keyStore.get(params.KeyId);
      if (!key) {
        throw new Error(`Key ${params.KeyId} not found`);
      }

      // Simulate KMS signing latency (~50-200ms for real KMS)
      await new Promise(r => setTimeout(r, 10 + Math.random() * 30));

      let signature: Buffer;
      if (key.keySpec === 'ECC_NIST_EDWARDS25519') {
        // Use real ED25519 signing if available, otherwise mock
        try {
          const privKeyObj = crypto.createPrivateKey({
            key: key.privateKey,
            format: 'der',
            type: 'pkcs8',
          });
          signature = Buffer.from(crypto.sign(null, Buffer.from(params.Message), privKeyObj));
        } catch {
          // Fallback: generate a realistic 64-byte signature
          signature = crypto.randomBytes(64);
        }
      } else {
        // ECDSA mock: generate a realistic DER-encoded signature
        // Real ECDSA signature is DER-encoded (typically 70-72 bytes)
        signature = crypto.randomBytes(71);
      }

      return {
        Signature: new Uint8Array(signature),
        SigningAlgorithm: params.SigningAlgorithm,
      };
    },
  };
}
