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

describe('Dashboard Accessibility (Sprint 14)', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  // === ARIA Landmarks ===

  test('header has role=banner', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="banner"');
  });

  test('navigation has role=tablist', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="tablist"');
    expect(res.body).toContain('aria-label="Dashboard Navigation"');
  });

  test('nav tabs have role=tab with aria-selected', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="tab"');
    expect(res.body).toContain('aria-selected="true"');
    expect(res.body).toContain('aria-selected="false"');
  });

  test('nav tabs have aria-controls linking to views', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-controls="view-marketplace"');
    expect(res.body).toContain('aria-controls="view-registry"');
    expect(res.body).toContain('aria-controls="view-activity"');
  });

  test('views have role=tabpanel', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="tabpanel"');
  });

  test('stats panel has role=region with aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="region"');
    expect(res.body).toContain('aria-label="Marketplace Statistics"');
  });

  test('footer has role=contentinfo', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="contentinfo"');
  });

  // === ARIA Labels on Interactive Elements ===

  test('search input has aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-label="Search agents by name, skill, or tag"');
  });

  test('filter selects have aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-label="Filter by category"');
    expect(res.body).toContain('aria-label="Filter by status"');
  });

  test('search button has aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-label="Search marketplace"');
  });

  test('modal has role=dialog with aria-modal', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="dialog"');
    expect(res.body).toContain('aria-modal="true"');
    expect(res.body).toContain('aria-label="Agent Details"');
  });

  test('close button has aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-label="Close modal"');
  });

  test('activity feed has role=log', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('role="log"');
    expect(res.body).toContain('aria-label="Activity Feed"');
  });

  test('toast container has aria-live=polite', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="toast-container"');
    expect(res.body).toContain('aria-live="polite"');
  });

  // === Keyboard Navigation ===

  test('nav tabs have tabindex for keyboard access', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('tabindex="0"');
  });

  test('keyboard navigation handler exists', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('ArrowRight');
    expect(res.body).toContain('ArrowLeft');
    expect(res.body).toContain('keydown');
  });

  // === Screen Reader Support ===

  test('has sr-only CSS class for screen readers', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.sr-only');
    expect(res.body).toContain('clip: rect(0,0,0,0)');
  });

  test('has screen reader labels for search', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('class="sr-only"');
  });

  test('stat values have aria-label', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('aria-label="Registered Agents count"');
    expect(res.body).toContain('aria-label="Published Skills count"');
  });

  // === Focus Visible Styles ===

  test('focus-visible styles exist for keyboard navigation', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain(':focus-visible');
    expect(res.body).toContain('outline: 2px solid #00d4ff');
  });

  test('buttons have focus-visible styles', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.btn:focus-visible');
  });

  test('modal close button has focus-visible styles', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('.modal-close:focus-visible');
  });
});
