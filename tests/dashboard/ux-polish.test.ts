import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, path: string) {
  return new Promise<{ status: number; body: string; contentType: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const text = await res.text();
        resolve({ status: res.status, body: text, contentType: res.headers.get('content-type') || '' });
      } finally {
        server.close();
      }
    });
  });
}

describe('Dashboard UX Polish (Sprint 14)', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // === Animations ===

  test('dashboard has CSS animation keyframes', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@keyframes fadeInUp');
    expect(res.body).toContain('@keyframes fadeIn');
    expect(res.body).toContain('@keyframes shimmer');
    expect(res.body).toContain('@keyframes pulse');
    expect(res.body).toContain('@keyframes slideDown');
    expect(res.body).toContain('@keyframes scaleIn');
  });

  test('dashboard has success animation keyframe', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@keyframes successPop');
  });

  test('dashboard has spinner animation keyframe', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@keyframes spin');
  });

  test('dashboard has counter animation keyframe', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('@keyframes countUp');
  });

  test('agent cards have staggered animation delays', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('agent-card:nth-child(1)');
    expect(res.body).toContain('agent-card:nth-child(2)');
    expect(res.body).toContain('agent-card:nth-child(3)');
    expect(res.body).toContain('animation-delay');
  });

  test('views have fade-in animation', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.view.active { display: block; animation: fadeIn');
  });

  test('modal has scale-in animation', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('animation: scaleIn');
  });

  // === Skeleton Loading ===

  test('marketplace has skeleton loading placeholders', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('skeleton-grid');
    expect(res.body).toContain('skeleton skeleton-card');
    expect(res.body).toContain('id="marketplace-skeleton"');
  });

  test('dashboard has skeleton CSS styles', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.skeleton {');
    expect(res.body).toContain('.skeleton-card');
    expect(res.body).toContain('.skeleton-line');
  });

  test('skeleton uses shimmer animation', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('animation: shimmer');
  });

  test('showSkeletonLoading function exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('function showSkeletonLoading');
  });

  // === Error Boundaries ===

  test('error state styling exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.error-state');
    expect(res.body).toContain('.error-icon');
    expect(res.body).toContain('.error-msg');
  });

  test('marketplace search has error boundary with retry', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('error-state');
    expect(res.body).toContain('Retry');
    expect(res.body).toContain('AbortError');
  });

  test('search functions use AbortController for timeouts', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('AbortController');
    expect(res.body).toContain('controller.abort');
  });

  test('registry search has error boundary', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('Failed to load registry');
  });

  // === Toast Notifications ===

  test('dashboard has toast notification container', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="toast-container"');
    expect(res.body).toContain('toast-container');
  });

  test('dashboard has toast CSS styles', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.toast-container');
    expect(res.body).toContain('.toast-success');
    expect(res.body).toContain('.toast-error');
    expect(res.body).toContain('.toast-info');
  });

  test('showToast function exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('function showToast');
  });

  // === Loading Spinner ===

  test('dashboard has loading spinner CSS', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.loading-spinner');
    expect(res.body).toContain('animation: spin');
  });

  // === Stat Counter Animation ===

  test('stat cards have hover effects', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.stat-card:hover');
    expect(res.body).toContain('translateY(-2px)');
  });

  test('animateStat function exists for counter animation', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('function animateStat');
    expect(res.body).toContain('.updated');
  });
});
