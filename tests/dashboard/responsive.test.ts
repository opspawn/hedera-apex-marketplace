import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, path: string) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const text = await res.text();
        resolve({ status: res.status, body: text });
      } finally {
        server.close();
      }
    });
  });
}

describe('Dashboard Responsive Design (Sprint 14)', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // === Tablet Breakpoint ===

  test('has tablet breakpoint at 1024px', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@media (max-width: 1024px)');
  });

  test('tablet layout uses 2-column stats grid', async () => {
    const res = await request(app, '/');
    // The 1024px media query should set stats to 2 columns
    expect(res.body).toContain('1024px');
    expect(res.body).toContain('repeat(2, 1fr)');
  });

  // === Mobile Breakpoint ===

  test('has mobile breakpoint at 768px', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@media (max-width: 768px)');
  });

  test('mobile layout has single column agents grid', async () => {
    const res = await request(app, '/');
    // Within the 768px media query, agents-grid should be 1fr
    expect(res.body).toContain('.agents-grid { grid-template-columns: 1fr; }');
  });

  test('mobile layout stacks toolbar vertically', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.toolbar { flex-direction: column; }');
  });

  test('mobile nav has horizontal scrolling without scrollbar', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('overflow-x: auto');
    expect(res.body).toContain('-webkit-overflow-scrolling: touch');
    expect(res.body).toContain('scrollbar-width: none');
  });

  test('mobile nav tabs use compact sizing', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('white-space: nowrap');
  });

  test('mobile header stacks vertically', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.header { flex-direction: column');
  });

  test('mobile modal uses full width', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('width: 95%');
    expect(res.body).toContain('max-height: 90vh');
  });

  // === Small Mobile Breakpoint ===

  test('has small mobile breakpoint at 480px', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@media (max-width: 480px)');
  });

  test('small mobile has reduced stat card font size', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('font-size: 1.25rem');
  });

  // === Responsive Agent Cards ===

  test('agent cards use 360px minmax for responsive grid', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('minmax(360px, 1fr)');
  });

  test('agent description has line clamping', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('-webkit-line-clamp');
    expect(res.body).toContain('-webkit-box-orient: vertical');
  });

  // === Viewport Meta Tag ===

  test('has proper viewport meta tag', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('name="viewport"');
    expect(res.body).toContain('width=device-width');
    expect(res.body).toContain('initial-scale=1.0');
  });

  // === Header Badges Responsive ===

  test('header badges wrap on small screens', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.header-right { display: flex; gap: 0.5rem; flex-wrap: wrap; }');
  });
});
