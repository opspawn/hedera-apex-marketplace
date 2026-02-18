/**
 * Sprint 45 Tests — KMS Configuration.
 *
 * Tests for:
 * - KMS config loading from environment variables
 * - Default values
 * - Config validation
 */

import { loadKMSConfig, KMSConfig } from '../../src/config';

describe('loadKMSConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns default config when no env vars set', () => {
    delete process.env.AWS_KMS_ENABLED;
    delete process.env.AWS_REGION;
    delete process.env.AWS_KMS_REGION;
    delete process.env.AWS_KMS_KEY_ID;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_KMS_ENDPOINT;
    delete process.env.AWS_KMS_KEY_SPEC;
    delete process.env.AWS_KMS_ROTATION_DAYS;
    delete process.env.AWS_KMS_MAX_SIGNS_PER_HOUR;

    const config = loadKMSConfig();
    expect(config.enabled).toBe(false);
    expect(config.region).toBe('us-east-1');
    expect(config.keyId).toBeUndefined();
    expect(config.accessKeyId).toBeUndefined();
    expect(config.secretAccessKey).toBeUndefined();
    expect(config.endpoint).toBeUndefined();
    expect(config.keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(config.rotationDays).toBe(90);
    expect(config.maxSignsPerHour).toBe(10000);
  });

  test('reads AWS_KMS_ENABLED', () => {
    process.env.AWS_KMS_ENABLED = 'true';
    const config = loadKMSConfig();
    expect(config.enabled).toBe(true);
  });

  test('reads AWS_REGION', () => {
    process.env.AWS_REGION = 'eu-west-1';
    const config = loadKMSConfig();
    expect(config.region).toBe('eu-west-1');
  });

  test('prefers AWS_REGION over AWS_KMS_REGION', () => {
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_KMS_REGION = 'ap-southeast-1';
    const config = loadKMSConfig();
    expect(config.region).toBe('us-west-2');
  });

  test('falls back to AWS_KMS_REGION when AWS_REGION not set', () => {
    delete process.env.AWS_REGION;
    process.env.AWS_KMS_REGION = 'ap-southeast-1';
    const config = loadKMSConfig();
    expect(config.region).toBe('ap-southeast-1');
  });

  test('reads AWS_KMS_KEY_ID', () => {
    process.env.AWS_KMS_KEY_ID = 'key-12345';
    const config = loadKMSConfig();
    expect(config.keyId).toBe('key-12345');
  });

  test('reads AWS credentials', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIA123';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret123';
    const config = loadKMSConfig();
    expect(config.accessKeyId).toBe('AKIA123');
    expect(config.secretAccessKey).toBe('secret123');
  });

  test('reads AWS_KMS_ENDPOINT', () => {
    process.env.AWS_KMS_ENDPOINT = 'http://localhost:4566';
    const config = loadKMSConfig();
    expect(config.endpoint).toBe('http://localhost:4566');
  });

  test('reads AWS_KMS_KEY_SPEC', () => {
    process.env.AWS_KMS_KEY_SPEC = 'ECC_SECG_P256K1';
    const config = loadKMSConfig();
    expect(config.keySpec).toBe('ECC_SECG_P256K1');
  });

  test('reads AWS_KMS_ROTATION_DAYS', () => {
    process.env.AWS_KMS_ROTATION_DAYS = '30';
    const config = loadKMSConfig();
    expect(config.rotationDays).toBe(30);
  });

  test('reads AWS_KMS_MAX_SIGNS_PER_HOUR', () => {
    process.env.AWS_KMS_MAX_SIGNS_PER_HOUR = '5000';
    const config = loadKMSConfig();
    expect(config.maxSignsPerHour).toBe(5000);
  });

  test('full production config', () => {
    process.env.AWS_KMS_ENABLED = 'true';
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:us-west-2:123:key/abc';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    process.env.AWS_KMS_KEY_SPEC = 'ECC_NIST_EDWARDS25519';
    process.env.AWS_KMS_ROTATION_DAYS = '45';
    process.env.AWS_KMS_MAX_SIGNS_PER_HOUR = '20000';

    const config = loadKMSConfig();
    expect(config.enabled).toBe(true);
    expect(config.region).toBe('us-west-2');
    expect(config.keyId).toBe('arn:aws:kms:us-west-2:123:key/abc');
    expect(config.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(config.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    expect(config.keySpec).toBe('ECC_NIST_EDWARDS25519');
    expect(config.rotationDays).toBe(45);
    expect(config.maxSignsPerHour).toBe(20000);
  });
});
