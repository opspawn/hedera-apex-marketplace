/**
 * AWS KMS Module — Enterprise key management for Hedera Agent Marketplace.
 *
 * Provides AWS KMS integration, multi-key management, and compliance reporting.
 * Works with both real AWS KMS (production) and mock KMS (testing/demo).
 */

// AWS SDK adapter
export {
  createAWSKMSClient,
  checkAWSKMSHealth,
  scheduleKeyDeletion,
  describeKey,
  type AWSKMSConfig,
  type AWSKMSHealthStatus,
} from './aws-kms-signer';

// Multi-key manager
export {
  MultiKeyManager,
  type KeyDerivationPath,
  type KeyRotationPolicy,
  type ManagedKeyEntry,
  type KeyUsageQuota,
  type MultiKeyManagerStatus,
  type ComplianceReport,
} from './key-manager';

// Re-export core KMS types from hedera module for convenience
export {
  type IKMSClient,
  type KMSKeyInfo,
  type KMSAuditEntry,
  type KMSSignResult,
  type KMSSignerConfig,
  type KMSKeySpec,
  type ManagedKey,
  KMSKeyManager,
  extractPublicKeyFromDER,
  createKMSKey,
  getPublicKey,
  signWithKMS,
  kmsSignerED25519,
  kmsSignerECDSA,
} from '../hedera/kms-signer';

// Re-export mock client for testing
export { createMockKMSClient } from '../hedera/mock-kms-client';

// Re-export KMS agent registration
export {
  KMSAgentRegistrationManager,
  type KMSAgentConfig,
  type KMSAgentRegistration,
  type KMSRegistrationResult,
  type KMSTransactionSignResult,
} from '../hedera/kms-agent-registration';
