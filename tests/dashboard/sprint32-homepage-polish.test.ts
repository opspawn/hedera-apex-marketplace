/**
 * Sprint 32: Homepage/Landing Polish Tests
 *
 * Verifies the landing page immediately communicates value:
 * - Hero section with stats
 * - CTA buttons (Chat + Register)
 * - Version v0.33.0
 * - Test count display
 * - Navigation between dashboard tabs
 */

import express from 'express';
import http from 'http';
import { createDashboardRouter } from '../../src/dashboard/index';

function request(server: http.Server, method: string, path: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Sprint 32: Homepage Polish', () => {
  let app: express.Application;
  let server: http.Server;

  beforeAll((done) => {
    app = express();
    app.use(createDashboardRouter());
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  // ===== Hero Section =====

  describe('hero section', () => {
    test('should contain hero banner', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Decentralized Agent Marketplace on Hedera');
    });

    test('should show Chat with Agents CTA button', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Chat with Agents');
    });

    test('should show Register Agent CTA button', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Register Agent');
    });

    test('should display test count stat', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('1950+');
      expect(res.text).toContain('Tests Passing');
    });

    test('should display HCS standards count', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('HCS Standards');
    });

    test('should display Live Hedera Testnet badge', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Hedera Testnet');
    });

    test('should display Chat Tools count', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Chat Tools');
    });

    test('should display Trust Score Analytics badge', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Trust');
      expect(res.text).toContain('Score Analytics');
    });
  });

  // ===== Version & Standards =====

  describe('version and standards', () => {
    test('should show version 0.33.0', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('v0.33.0');
    });

    test('should list all 6 HCS standards', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('HCS-10');
      expect(res.text).toContain('HCS-11');
      expect(res.text).toContain('HCS-14');
      expect(res.text).toContain('HCS-19');
      expect(res.text).toContain('HCS-20');
      expect(res.text).toContain('HCS-26');
    });

    test('should show testnet account', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('0.0.7854018');
    });
  });

  // ===== Navigation Tabs =====

  describe('navigation', () => {
    test('should have Marketplace tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="marketplace"');
    });

    test('should have Agent Registry tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="registry"');
    });

    test('should have Register Agent tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="register"');
    });

    test('should have Agent Chat link', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Agent Chat');
      expect(res.text).toContain('/chat');
    });

    test('should have Analytics tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="analytics"');
    });

    test('should have Live Demo tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="demo"');
    });

    test('should have HOL Registry tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="hol-status"');
    });

    test('should have Connections tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="connections"');
    });

    test('should have Reachability tab', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('data-view="reachability"');
    });
  });

  // ===== Stats Panel =====

  describe('stats panel', () => {
    test('should have 4 stat cards', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('stat-agents');
      expect(res.text).toContain('stat-skills');
      expect(res.text).toContain('stat-hires');
      expect(res.text).toContain('stat-active');
    });

    test('should label stats correctly', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Registered Agents');
      expect(res.text).toContain('Hedera Messages');
      expect(res.text).toContain('Active Connections');
      expect(res.text).toContain('Published Skills');
    });
  });

  // ===== Skeleton Loading & Empty States =====

  describe('loading and empty states', () => {
    test('should include skeleton loaders for marketplace', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('skeleton');
      expect(res.text).toContain('skeleton-card');
    });

    test('should include category filter chips', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('category-chip');
      expect(res.text).toContain('NLP');
      expect(res.text).toContain('Analytics');
      expect(res.text).toContain('Security');
    });

    test('should include search functionality', async () => {
      const res = await request(server, 'GET', '/');
      expect(res.text).toContain('Search agents');
      expect(res.text).toContain('search-input');
    });
  });

  // ===== Demo Page =====

  describe('demo page', () => {
    test('should serve demo page', async () => {
      const res = await request(server, 'GET', '/demo');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
    });

    test('should serve demo walkthrough page', async () => {
      const res = await request(server, 'GET', '/demo/walkthrough');
      expect(res.status).toBe(200);
    });
  });
});
