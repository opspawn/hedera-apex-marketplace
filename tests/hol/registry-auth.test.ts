/**
 * Tests for RegistryAuth — Live Registry Broker registration and verification.
 *
 * Sprint 18b: Tests credential loading, live registration, state persistence,
 * and verification against the HOL Registry Broker.
 */

import { RegistryAuth, LiveRegistrationConfig } from '../../src/hol/registry-auth';
import * as fs from 'fs';
import * as path from 'path';

// Mock the standards SDK used by RegistryBroker
jest.mock('@hashgraphonline/standards-sdk', () => ({
  RegistryBrokerClient: jest.fn().mockImplementation(() => ({
    authenticateWithLedgerCredentials: jest.fn().mockResolvedValue(undefined),
    registerAgent: jest.fn().mockResolvedValue({
      uaid: 'live-uaid-001',
      agentId: 'live-agent-001',
    }),
    search: jest.fn().mockResolvedValue({
      agents: [{ uaid: 'live-uaid-001', display_name: 'HireWire Agent Marketplace' }],
    }),
  })),
}));

// Mock fs to avoid real file system operations
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn().mockReturnValue('{}'),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});

const TEST_CONFIG: LiveRegistrationConfig = {
  accountId: '0.0.7854018',
  privateKey: 'mock-private-key-302e020100300506032b657004',
  network: 'testnet',
  brokerBaseUrl: 'https://hol.org/registry/api/v1',
  agentEndpoint: 'https://hedera.opspawn.com/api/agent',
};

describe('RegistryAuth', () => {
  let auth: RegistryAuth;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    auth = new RegistryAuth(TEST_CONFIG);
  });

  describe('constructor', () => {
    it('should create with valid config', () => {
      expect(auth).toBeInstanceOf(RegistryAuth);
    });

    it('should load existing state file on construction', () => {
      const savedState = {
        success: true,
        uaid: 'saved-uaid',
        agentId: 'saved-agent',
        timestamp: '2026-02-17T00:00:00Z',
        stored: true,
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(savedState));

      const authWithState = new RegistryAuth(TEST_CONFIG);
      const state = authWithState.getRegistrationState();
      expect(state).not.toBeNull();
      expect(state?.uaid).toBe('saved-uaid');
      expect(state?.agentId).toBe('saved-agent');
    });

    it('should handle corrupt state file gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('not valid json');

      const authBad = new RegistryAuth(TEST_CONFIG);
      expect(authBad.getRegistrationState()).toBeNull();
    });

    it('should handle missing state file', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const authNoState = new RegistryAuth(TEST_CONFIG);
      expect(authNoState.getRegistrationState()).toBeNull();
    });
  });

  describe('hasValidCredentials', () => {
    it('should return true with valid accountId and privateKey', () => {
      expect(auth.hasValidCredentials()).toBe(true);
    });

    it('should return false with empty privateKey', () => {
      const noKey = new RegistryAuth({
        ...TEST_CONFIG,
        privateKey: '',
      });
      expect(noKey.hasValidCredentials()).toBe(false);
    });

    it('should return false with short privateKey', () => {
      const shortKey = new RegistryAuth({
        ...TEST_CONFIG,
        privateKey: 'short',
      });
      expect(shortKey.hasValidCredentials()).toBe(false);
    });

    it('should return false with empty accountId', () => {
      const noAccount = new RegistryAuth({
        ...TEST_CONFIG,
        accountId: '',
      });
      expect(noAccount.hasValidCredentials()).toBe(false);
    });
  });

  describe('registerLive', () => {
    it('should register successfully and return uaid', async () => {
      const result = await auth.registerLive();
      expect(result.success).toBe(true);
      expect(result.uaid).toBe('live-uaid-001');
      expect(result.agentId).toBe('live-agent-001');
      expect(result.stored).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should persist state on successful registration', async () => {
      await auth.registerLive();
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toContain('registry-registration.json');
      const written = JSON.parse(writeCall[1]);
      expect(written.uaid).toBe('live-uaid-001');
    });

    it('should create state directory if not exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      await auth.registerLive();
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('state'),
        { recursive: true }
      );
    });

    it('should update internal state after registration', async () => {
      expect(auth.getRegistrationState()).toBeNull();
      await auth.registerLive();
      const state = auth.getRegistrationState();
      expect(state).not.toBeNull();
      expect(state?.success).toBe(true);
      expect(state?.uaid).toBe('live-uaid-001');
    });

    it('should handle registration failure gracefully', async () => {
      // Override the mock to throw
      const { RegistryBrokerClient } = require('@hashgraphonline/standards-sdk');
      RegistryBrokerClient.mockImplementationOnce(() => ({
        authenticateWithLedgerCredentials: jest.fn().mockRejectedValue(new Error('Auth failed')),
      }));

      const failAuth = new RegistryAuth(TEST_CONFIG);
      const result = await failAuth.registerLive();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Auth failed');
      expect(result.stored).toBe(false);
    });

    it('should not persist state on failed registration', async () => {
      const { RegistryBrokerClient } = require('@hashgraphonline/standards-sdk');
      RegistryBrokerClient.mockImplementationOnce(() => ({
        authenticateWithLedgerCredentials: jest.fn().mockRejectedValue(new Error('Fail')),
      }));

      const failAuth = new RegistryAuth(TEST_CONFIG);
      jest.clearAllMocks();
      await failAuth.registerLive();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('verifyLive', () => {
    it('should verify a registered agent', async () => {
      await auth.registerLive();
      const result = await auth.verifyLive();
      expect(result.verified).toBe(true);
      expect(result.agentFound).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should return uaid from registration state', async () => {
      await auth.registerLive();
      const result = await auth.verifyLive();
      expect(result.uaid).toBeDefined();
    });

    it('should handle verification failure gracefully', async () => {
      const { RegistryBrokerClient } = require('@hashgraphonline/standards-sdk');
      RegistryBrokerClient.mockImplementationOnce(() => ({
        authenticateWithLedgerCredentials: jest.fn().mockRejectedValue(new Error('Network error')),
      }));

      const failAuth = new RegistryAuth(TEST_CONFIG);
      const result = await failAuth.verifyLive();
      expect(result.verified).toBe(false);
      expect(result.agentFound).toBe(false);
    });
  });

  describe('getBroker', () => {
    it('should return a RegistryBroker instance', () => {
      const broker = auth.getBroker();
      expect(broker).toBeDefined();
      expect(broker.getBrokerUrl()).toBe('https://hol.org/registry/api/v1');
    });
  });

  describe('getRegistrationState', () => {
    it('should return null before registration', () => {
      expect(auth.getRegistrationState()).toBeNull();
    });

    it('should return state after registration', async () => {
      await auth.registerLive();
      const state = auth.getRegistrationState();
      expect(state).not.toBeNull();
      expect(state?.success).toBe(true);
    });
  });
});

describe('RegistryAuth.fromConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env vars
    delete process.env.HEDERA_PRIVATE_KEY;
  });

  it('should create from app config with credential file', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) return true;
      return false;
    });
    (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) {
        return JSON.stringify({ privateKey: 'from-cred-file-key-long-enough' });
      }
      return '{}';
    });

    const auth = RegistryAuth.fromConfig();
    expect(auth).toBeInstanceOf(RegistryAuth);
    expect(auth.hasValidCredentials()).toBe(true);
  });

  it('should fall back to config defaults when no credential file', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const auth = RegistryAuth.fromConfig();
    expect(auth).toBeInstanceOf(RegistryAuth);
    // Without env var or cred file, privateKey is empty
    expect(auth.hasValidCredentials()).toBe(false);
  });

  it('should use env var private key when available', () => {
    process.env.HEDERA_PRIVATE_KEY = 'env-key-long-enough-to-be-valid';
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const auth = RegistryAuth.fromConfig();
    expect(auth.hasValidCredentials()).toBe(true);

    delete process.env.HEDERA_PRIVATE_KEY;
  });

  it('should handle credential file with private_key field', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) return true;
      return false;
    });
    (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) {
        return JSON.stringify({ private_key: 'alt-field-key-long-enough' });
      }
      return '{}';
    });

    const auth = RegistryAuth.fromConfig();
    expect(auth.hasValidCredentials()).toBe(true);
  });

  it('should handle unreadable credential file', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) return true;
      return false;
    });
    (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('hedera.json')) {
        throw new Error('Permission denied');
      }
      return '{}';
    });

    const auth = RegistryAuth.fromConfig();
    expect(auth).toBeInstanceOf(RegistryAuth);
    // Should not throw, just fall back to empty key
    expect(auth.hasValidCredentials()).toBe(false);
  });
});
