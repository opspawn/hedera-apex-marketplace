/**
 * AWS KMS ED25519 Signer — Real AWS SDK adapter.
 *
 * Wraps @aws-sdk/client-kms to implement the IKMSClient interface
 * used by the existing KMS signer infrastructure. Provides:
 * - Real AWS KMS key creation (ED25519 + ECDSA secp256k1)
 * - Real KMS signing with proper message types
 * - Connection health checking
 * - Graceful fallback to mock when AWS is unavailable
 *
 * AWS KMS added ED25519 (ECC_EDWARDS25519) support Nov 2025.
 */

import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
  ListKeysCommand,
  ScheduleKeyDeletionCommand,
  KeySpec,
  KeyUsageType,
  SigningAlgorithmSpec,
  MessageType,
} from '@aws-sdk/client-kms';
import { IKMSClient } from '../hedera/kms-signer';

// ==========================================
// Types
// ==========================================

export interface AWSKMSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For LocalStack or testing
}

export interface AWSKMSHealthStatus {
  available: boolean;
  region: string;
  endpoint?: string;
  latencyMs: number;
  keyCount?: number;
  error?: string;
}

// ==========================================
// AWS KMS Client Adapter
// ==========================================

/**
 * Creates an IKMSClient backed by real AWS KMS.
 * Falls back gracefully if AWS credentials are missing.
 */
export function createAWSKMSClient(config: AWSKMSConfig): IKMSClient {
  const clientConfig: Record<string, unknown> = {
    region: config.region,
  };

  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const kmsClient = new KMSClient(clientConfig);

  return {
    async createKey(params) {
      const command = new CreateKeyCommand({
        KeySpec: params.KeySpec as KeySpec,
        KeyUsage: params.KeyUsage as KeyUsageType,
        Description: params.Description,
        Tags: params.Tags?.map(t => ({
          TagKey: t.TagKey,
          TagValue: t.TagValue,
        })),
      });

      const response = await kmsClient.send(command);

      if (!response.KeyMetadata) {
        throw new Error('AWS KMS CreateKey returned no KeyMetadata');
      }

      return {
        KeyMetadata: {
          KeyId: response.KeyMetadata.KeyId!,
          Arn: response.KeyMetadata.Arn!,
          CreationDate: response.KeyMetadata.CreationDate || new Date(),
          KeySpec: response.KeyMetadata.KeySpec || params.KeySpec,
        },
      };
    },

    async getPublicKey(params) {
      const command = new GetPublicKeyCommand({
        KeyId: params.KeyId,
      });

      const response = await kmsClient.send(command);

      if (!response.PublicKey) {
        throw new Error('AWS KMS GetPublicKey returned no public key data');
      }

      return {
        PublicKey: response.PublicKey,
        KeySpec: response.KeySpec || '',
      };
    },

    async sign(params) {
      const command = new SignCommand({
        KeyId: params.KeyId,
        Message: params.Message,
        MessageType: params.MessageType as MessageType,
        SigningAlgorithm: params.SigningAlgorithm as SigningAlgorithmSpec,
      });

      const response = await kmsClient.send(command);

      if (!response.Signature) {
        throw new Error('AWS KMS Sign returned no signature');
      }

      return {
        Signature: response.Signature,
        SigningAlgorithm: response.SigningAlgorithm || params.SigningAlgorithm,
      };
    },
  };
}

/**
 * Check AWS KMS service health and connectivity.
 */
export async function checkAWSKMSHealth(config: AWSKMSConfig): Promise<AWSKMSHealthStatus> {
  const start = Date.now();
  const clientConfig: Record<string, unknown> = {
    region: config.region,
  };

  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  try {
    const kmsClient = new KMSClient(clientConfig);
    const command = new ListKeysCommand({ Limit: 1 });
    const response = await kmsClient.send(command);

    return {
      available: true,
      region: config.region,
      endpoint: config.endpoint,
      latencyMs: Date.now() - start,
      keyCount: response.Keys?.length,
    };
  } catch (err) {
    return {
      available: false,
      region: config.region,
      endpoint: config.endpoint,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Schedule a KMS key for deletion (minimum 7-day waiting period).
 * Use for cleaning up rotated keys after the retention period.
 */
export async function scheduleKeyDeletion(
  config: AWSKMSConfig,
  keyId: string,
  pendingWindowInDays: number = 7,
): Promise<{ deletionDate: Date | undefined; keyId: string }> {
  const clientConfig: Record<string, unknown> = {
    region: config.region,
  };

  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const kmsClient = new KMSClient(clientConfig);
  const command = new ScheduleKeyDeletionCommand({
    KeyId: keyId,
    PendingWindowInDays: Math.max(7, Math.min(30, pendingWindowInDays)),
  });

  const response = await kmsClient.send(command);
  return {
    deletionDate: response.DeletionDate,
    keyId: response.KeyId || keyId,
  };
}

/**
 * Describe a KMS key to get its metadata.
 */
export async function describeKey(
  config: AWSKMSConfig,
  keyId: string,
): Promise<{
  keyId: string;
  arn: string;
  keySpec: string;
  keyState: string;
  creationDate: Date | undefined;
  description: string;
  enabled: boolean;
}> {
  const clientConfig: Record<string, unknown> = {
    region: config.region,
  };

  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const kmsClient = new KMSClient(clientConfig);
  const command = new DescribeKeyCommand({ KeyId: keyId });
  const response = await kmsClient.send(command);

  if (!response.KeyMetadata) {
    throw new Error(`Key ${keyId} not found`);
  }

  return {
    keyId: response.KeyMetadata.KeyId || keyId,
    arn: response.KeyMetadata.Arn || '',
    keySpec: response.KeyMetadata.KeySpec || '',
    keyState: response.KeyMetadata.KeyState || '',
    creationDate: response.KeyMetadata.CreationDate,
    description: response.KeyMetadata.Description || '',
    enabled: response.KeyMetadata.Enabled ?? false,
  };
}
