/**
 * Tests for HOL Registry Broker and HCS-10 Connection API routes.
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

// Mock the standards-sdk
jest.mock('@hashgraphonline/standards-sdk', () => ({
  RegistryBrokerClient: jest.fn().mockImplementation(() => ({
    authenticateWithLedgerCredentials: jest.fn().mockResolvedValue(undefined),
    registerAgent: jest.fn().mockResolvedValue({ uaid: 'test-uaid', agentId: 'test-agent' }),
    search: jest.fn().mockResolvedValue({ agents: [{ uaid: 'test-uaid' }] }),
  })),
  HCS26BaseClient: jest.fn().mockImplementation(() => ({})),
  hcs26DiscoveryMetadataSchema: { safeParse: jest.fn().mockReturnValue({ success: true }) },
}));

// Request helper matching existing test patterns
async function request(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        resolve({ status: res.status, body: json });
      } finally {
        server.close();
      }
    });
  });
}

describe('Registry Broker Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('GET /api/registry/status', () => {
    it('should return registry status', async () => {
      const res = await request(app, 'GET', '/api/registry/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('registered');
      expect(res.body).toHaveProperty('brokerUrl');
      expect(res.body).toHaveProperty('lastCheck');
    });

    it('should show not registered initially', async () => {
      const res = await request(app, 'GET', '/api/registry/status');
      expect(res.body.registered).toBe(false);
    });
  });

  describe('POST /api/registry/register', () => {
    it('should trigger registration', async () => {
      const res = await request(app, 'POST', '/api/registry/register');
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/registry/verify', () => {
    it('should verify registration', async () => {
      const res = await request(app, 'GET', '/api/registry/verify');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('verified');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});

describe('Connection Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('GET /api/agent/connections', () => {
    it('should return connection list', async () => {
      const res = await request(app, 'GET', '/api/agent/connections');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('connections');
      expect(res.body.connections).toEqual([]);
      expect(res.body).toHaveProperty('active');
      expect(res.body).toHaveProperty('pending');
    });
  });

  describe('GET /api/agent/connections/pending', () => {
    it('should return empty pending list', async () => {
      const res = await request(app, 'GET', '/api/agent/connections/pending');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requests');
      expect(res.body.requests).toEqual([]);
    });
  });

  describe('POST /api/agent/connect', () => {
    it('should require requestId', async () => {
      const res = await request(app, 'POST', '/api/agent/connect', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should fail for non-existent request', async () => {
      const res = await request(app, 'POST', '/api/agent/connect', { requestId: 'nonexistent' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('connection_failed');
    });
  });

  describe('POST /api/agent/connections/:id/message', () => {
    it('should require content', async () => {
      const res = await request(app, 'POST', '/api/agent/connections/test-conn/message', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });
  });
});

describe('Updated health endpoint', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('should report version 0.16.0', async () => {
    const res = await request(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('0.16.0');
  });

  it('should include hcs-10-connections in agent card', async () => {
    const res = await request(app, 'GET', '/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toContain('hcs-10-connections');
  });
});
