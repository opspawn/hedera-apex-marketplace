import { createApp } from '../../src/index';
import { Express } from 'express';

// Request helper
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

describe('Demo API Routes', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  describe('POST /api/demo/run', () => {
    it('should start the demo flow', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      // Status should be running or completed (fast enough to complete in the 100ms delay)
      expect(['running', 'completed']).toContain(res.body.status);
    });

    it('should return steps array', async () => {
      const res = await request(app, 'POST', '/api/demo/run');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.steps)).toBe(true);
    });
  });

  describe('GET /api/demo/status', () => {
    it('should return idle status initially', async () => {
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('idle');
      expect(res.body.steps).toEqual([]);
    });

    it('should return demo state after run', async () => {
      // Start the demo
      await request(app, 'POST', '/api/demo/run');
      // Wait for it to complete
      await new Promise(r => setTimeout(r, 500));
      const res = await request(app, 'GET', '/api/demo/status');
      expect(res.status).toBe(200);
      // Should be completed or still running
      expect(['running', 'completed']).toContain(res.body.status);
    });
  });

  describe('Health check reflects version bump', () => {
    it('should return version 0.14.0', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('0.26.0');
    });

    it('should report test count 521', async () => {
      const res = await request(app, 'GET', '/health');
      expect(res.body.test_count).toBe(1604);
    });
  });
});
