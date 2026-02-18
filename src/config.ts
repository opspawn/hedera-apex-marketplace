import dotenv from 'dotenv';
import { MarketplaceConfig } from './types';

dotenv.config();

export interface KMSConfig {
  enabled: boolean;
  region: string;
  keyId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  keySpec: 'ECC_NIST_EDWARDS25519' | 'ECC_SECG_P256K1';
  rotationDays: number;
  maxSignsPerHour: number;
}

export function loadKMSConfig(): KMSConfig {
  return {
    enabled: process.env.AWS_KMS_ENABLED === 'true',
    region: process.env.AWS_REGION || process.env.AWS_KMS_REGION || 'us-east-1',
    keyId: process.env.AWS_KMS_KEY_ID || undefined,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
    endpoint: process.env.AWS_KMS_ENDPOINT || undefined,
    keySpec: (process.env.AWS_KMS_KEY_SPEC as KMSConfig['keySpec']) || 'ECC_NIST_EDWARDS25519',
    rotationDays: parseInt(process.env.AWS_KMS_ROTATION_DAYS || '90', 10),
    maxSignsPerHour: parseInt(process.env.AWS_KMS_MAX_SIGNS_PER_HOUR || '10000', 10),
  };
}

export function loadConfig(): MarketplaceConfig {
  return {
    hedera: {
      accountId: process.env.HEDERA_ACCOUNT_ID || '0.0.7854018',
      privateKey: process.env.HEDERA_PRIVATE_KEY || '',
      network: (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    },
    topics: {
      registry: process.env.REGISTRY_TOPIC_ID || '0.0.7311321',
      inbound: process.env.INBOUND_TOPIC_ID || '0.0.7854276',
      outbound: process.env.OUTBOUND_TOPIC_ID || '0.0.7854275',
      profile: process.env.PROFILE_TOPIC_ID || '0.0.7854282',
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
    },
  };
}

export const config = loadConfig();
export const kmsConfig = loadKMSConfig();
