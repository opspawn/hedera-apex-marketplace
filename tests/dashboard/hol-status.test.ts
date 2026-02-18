/**
 * Tests for the HOL Registry Status dashboard panel.
 */

import { createApp } from '../../src/index';

describe('Dashboard HOL Status Panel', () => {
  it('should include HOL Registry tab in dashboard HTML', async () => {
    const { app } = createApp();

    // Use a simple test by fetching the dashboard route
    const http = require('http');
    const server = http.createServer(app);

    const html = await new Promise<string>((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        http.get(`http://localhost:${port}/`, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => {
            server.close();
            resolve(data);
          });
        });
      });
    });

    // Verify HOL Status tab exists
    expect(html).toContain('hol-status');
    expect(html).toContain('HOL Registry');

    // Verify HOL status elements
    expect(html).toContain('hol-broker-status');
    expect(html).toContain('hol-connection-status');
    expect(html).toContain('hol-active-connections');

    // Verify broker details
    expect(html).toContain('hol.org/registry/api/v1');
    expect(html).toContain('hol-uaid');
    expect(html).toContain('Register with HOL');

    // Verify connection section
    expect(html).toContain('HCS-10');
    expect(html).toContain('hol-pending');
  });

  it('should include HOL JavaScript functions', async () => {
    const { app } = createApp();
    const http = require('http');
    const server = http.createServer(app);

    const html = await new Promise<string>((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        http.get(`http://localhost:${port}/`, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => {
            server.close();
            resolve(data);
          });
        });
      });
    });

    expect(html).toContain('loadHolStatus');
    expect(html).toContain('triggerHolRegistration');
    expect(html).toContain('/api/registry/status');
    expect(html).toContain('/api/agent/connections');
  });
});
