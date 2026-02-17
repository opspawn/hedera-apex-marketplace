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

describe('GET /api/stats', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  it('should return 200 with all required fields', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.testCount).toBeDefined();
    expect(res.body.hcsStandards).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.uptime_seconds).toBeDefined();
    expect(res.body.agentsRegistered).toBeDefined();
  });

  it('should return correct version', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.version).toBe('0.30.0');
  });

  it('should return test count as number >= 1335', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(typeof res.body.testCount).toBe('number');
    expect(res.body.testCount).toBeGreaterThanOrEqual(1335);
  });

  it('should return all 6 HCS standards', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.hcsStandards).toEqual([
      'HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26',
    ]);
    expect(res.body.hcsStandards.length).toBe(6);
  });

  it('should return uptime as formatted string', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.uptime).toMatch(/^\d+h \d+m \d+s$/);
  });

  it('should return uptime_seconds as non-negative number', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(typeof res.body.uptime_seconds).toBe('number');
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it('should return agentsRegistered as non-negative number', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(typeof res.body.agentsRegistered).toBe('number');
    expect(res.body.agentsRegistered).toBeGreaterThanOrEqual(0);
  });

  it('should include all fields needed for submission form', async () => {
    const res = await request(app, 'GET', '/api/stats');
    const body = res.body;
    // All required fields for submission
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('testCount');
    expect(body).toHaveProperty('hcsStandards');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('agentsRegistered');
  });

  it('should return JSON content type', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.status).toBe(200);
    // Body should be a plain object (JSON parsed)
    expect(typeof res.body).toBe('object');
    expect(res.body).not.toBeNull();
  });

  it('should include HCS-10 in standards', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.hcsStandards).toContain('HCS-10');
  });

  it('should include HCS-20 in standards', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.hcsStandards).toContain('HCS-20');
  });

  it('should include HCS-26 in standards', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.hcsStandards).toContain('HCS-26');
  });

  it('should return version matching semver pattern', async () => {
    const res = await request(app, 'GET', '/api/stats');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
