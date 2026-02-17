import { createApp } from '../../src/index';
import { Express } from 'express';

async function request(app: Express, path: string, method = 'GET', body?: unknown) {
  return new Promise<{ status: number; body: string; contentType: string }>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        resolve({ status: res.status, body: text, contentType: res.headers.get('content-type') || '' });
      } finally {
        server.close();
      }
    });
  });
}

describe('Dashboard', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = createApp());
  });

  test('GET / returns HTML dashboard', async () => {
    const res = await request(app, '/');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('Hedera Agent Marketplace');
  });

  test('dashboard contains search bar', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="search"');
    expect(res.body).toContain('searchMarketplace');
  });

  test('dashboard contains agent grid container', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="marketplace-agents"');
    expect(res.body).toContain('agents-grid');
  });

  test('dashboard references HCS standards in footer', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('HCS-10');
    expect(res.body).toContain('HCS-11');
    expect(res.body).toContain('HCS-14');
    expect(res.body).toContain('HCS-19');
    expect(res.body).toContain('HCS-26');
  });

  // New tests for enhanced dashboard

  test('dashboard contains navigation tabs', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('data-view="marketplace"');
    expect(res.body).toContain('data-view="registry"');
    expect(res.body).toContain('data-view="activity"');
    expect(res.body).toContain('data-view="register"');
  });

  test('dashboard contains stats panel with four metrics', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="stat-agents"');
    expect(res.body).toContain('id="stat-skills"');
    expect(res.body).toContain('id="stat-hires"');
    expect(res.body).toContain('id="stat-active"');
    expect(res.body).toContain('Registered Agents');
    expect(res.body).toContain('Connections');
    expect(res.body).toContain('Messages');
    expect(res.body).toContain('Published Skills');
  });

  test('dashboard contains marketplace view with category filter', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="filter-category"');
    expect(res.body).toContain('All Categories');
    expect(res.body).toContain('NLP');
    expect(res.body).toContain('Analytics');
    expect(res.body).toContain('Automation');
  });

  test('dashboard contains status filter', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="filter-status"');
    expect(res.body).toContain('All Status');
    expect(res.body).toContain('Online');
    expect(res.body).toContain('Offline');
  });

  test('dashboard contains activity feed section', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="activity-feed"');
    expect(res.body).toContain('id="view-activity"');
  });

  test('dashboard contains agent registration form', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="reg-name"');
    expect(res.body).toContain('id="reg-description"');
    expect(res.body).toContain('id="reg-endpoint"');
    expect(res.body).toContain('id="reg-skill-name"');
    expect(res.body).toContain('id="reg-payment"');
    expect(res.body).toContain('registerAgent()');
  });

  test('dashboard contains agent detail modal', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="agent-modal"');
    expect(res.body).toContain('id="modal-content"');
    expect(res.body).toContain('closeModal()');
  });

  test('dashboard contains hire flow functions', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('openHireModal');
    expect(res.body).toContain('executeHire');
    expect(res.body).toContain('/api/marketplace/hire');
  });

  test('dashboard wires to marketplace discover API', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('/api/marketplace/discover');
    expect(res.body).toContain('/api/marketplace/agent/');
    expect(res.body).toContain('/api/marketplace/register');
  });

  test('dashboard contains registry view with search', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('id="view-registry"');
    expect(res.body).toContain('id="registry-agents"');
    expect(res.body).toContain('id="registry-search"');
    expect(res.body).toContain('searchRegistry');
  });

  test('dashboard contains proper dark theme styling', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('background: #080c14');
    expect(res.body).toContain('#00d4ff');
    expect(res.body).toContain('color: #e0e0e0');
  });

  test('GET /api/dashboard/stats returns stats JSON', async () => {
    const res = await request(app, '/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    const data = JSON.parse(res.body);
    expect(data.timestamp).toBeDefined();
    expect(data.protocols).toContain('HCS-10');
    expect(data.protocols).toContain('HCS-19');
    expect(data.protocols).toContain('HCS-26');
  });

  test('dashboard HTML has proper meta tags', async () => {
    const res = await request(app, '/');
    expect(res.body).toContain('charset="UTF-8"');
    expect(res.body).toContain('viewport');
    expect(res.body).toContain('<title>Hedera Agent Marketplace</title>');
  });

  // Demo page tests
  test('GET /demo returns demo page HTML', async () => {
    const res = await request(app, '/demo');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('Live Demo');
    expect(res.body).toContain('Hedera');
  });

  test('demo page contains HCS standard badges', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('HCS-10');
    expect(res.body).toContain('HCS-11');
    expect(res.body).toContain('HCS-14');
    expect(res.body).toContain('HCS-19');
    expect(res.body).toContain('HCS-20');
    expect(res.body).toContain('HCS-26');
  });

  test('demo page contains start button and step list', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('id="start-btn"');
    expect(res.body).toContain('id="steps-list"');
    expect(res.body).toContain('startDemo');
  });

  test('demo page contains progress bar', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('id="progress-bar"');
    expect(res.body).toContain('id="progress-fill"');
    expect(res.body).toContain('progress-fill');
  });

  test('demo page has auto-start support via query param', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('auto');
    expect(res.body).toContain('URLSearchParams');
  });

  test('demo page references API endpoints', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('/api/demo/run');
    expect(res.body).toContain('/api/demo/status');
  });

  test('demo page contains summary card section', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('id="summary-card"');
    expect(res.body).toContain('summary-grid');
    expect(res.body).toContain('Demo Complete');
  });

  test('demo page has step animation styles', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('step-card');
    expect(res.body).toContain('translateY');
    expect(res.body).toContain('.visible');
  });

  test('demo page has dark theme consistent with main dashboard', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('#080c14');
    expect(res.body).toContain('#00d4ff');
    expect(res.body).toContain('#111827');
  });

  // HCS-26 Skill Registry Demo
  test('demo page contains HCS-26 skill registry demo section', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('id="skill-registry-demo"');
    expect(res.body).toContain('HCS-26 Skill Registry');
    expect(res.body).toContain('id="skill-demo-btn"');
    expect(res.body).toContain('runSkillDemo');
  });

  test('demo page skill registry demo references API endpoints', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('/api/skills/publish');
    expect(res.body).toContain('/api/skills/search');
  });

  test('demo page skill registry demo has result container', async () => {
    const res = await request(app, '/demo');
    expect(res.body).toContain('id="skill-demo-steps"');
    expect(res.body).toContain('id="skill-demo-result"');
  });

  // Demo walkthrough page tests (Sprint 12)
  test('GET /demo/walkthrough returns walkthrough HTML', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
    expect(res.body).toContain('Demo Walkthrough');
  });

  test('walkthrough page contains all 7 scene cards', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('id="scene-1"');
    expect(res.body).toContain('id="scene-2"');
    expect(res.body).toContain('id="scene-3"');
    expect(res.body).toContain('id="scene-4"');
    expect(res.body).toContain('id="scene-5"');
    expect(res.body).toContain('id="scene-6"');
    expect(res.body).toContain('id="scene-7"');
  });

  test('walkthrough page contains HCS standard badges', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('HCS-10');
    expect(res.body).toContain('HCS-11');
    expect(res.body).toContain('HCS-14');
    expect(res.body).toContain('HCS-19');
    expect(res.body).toContain('HCS-20');
    expect(res.body).toContain('HCS-26');
  });

  test('walkthrough page contains scene titles', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('Marketplace Overview');
    expect(res.body).toContain('Seed Demo Agents');
    expect(res.body).toContain('Browse & Search Marketplace');
    expect(res.body).toContain('Agent Profile Detail');
    expect(res.body).toContain('Hire Agent for Task');
    expect(res.body).toContain('Task Completion');
    expect(res.body).toContain('Rating & Points');
  });

  test('walkthrough page contains narration sections', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('scene-narration');
    expect(res.body).toContain('Narration');
    // Check specific narration text
    expect(res.body).toContain('decentralized platform');
    expect(res.body).toContain('reputation points');
  });

  test('walkthrough page contains timeline navigation', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('scrollToScene');
    expect(res.body).toContain('tl-dot');
  });

  test('walkthrough page contains summary section', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('Demo Summary');
    expect(res.body).toContain('7'); // 7 scenes
    expect(res.body).toContain('6'); // 6 standards
    expect(res.body).toContain('150'); // points
    expect(res.body).toContain('~3 min');
  });

  test('walkthrough page has link to live demo', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('/demo?auto=1');
    expect(res.body).toContain('Run Live Demo');
  });

  test('walkthrough page has dark theme consistent with project', async () => {
    const res = await request(app, '/demo/walkthrough');
    expect(res.body).toContain('#080c14');
    expect(res.body).toContain('#00d4ff');
    expect(res.body).toContain('#111827');
  });

  // Sprint 13: Narration endpoint
  test('GET /demo/narration returns narration script JSON', async () => {
    const res = await request(app, '/demo/narration');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    const data = JSON.parse(res.body);
    expect(data.title).toContain('Hedera Agent Marketplace');
    expect(data.version).toBe('0.14.0');
    expect(data.segments).toHaveLength(7);
    expect(data.summary.standards_covered).toHaveLength(6);
  });

  test('narration segments have correct structure', async () => {
    const res = await request(app, '/demo/narration');
    const data = JSON.parse(res.body);
    for (const seg of data.segments) {
      expect(seg.scene_id).toBeDefined();
      expect(seg.narration).toBeDefined();
      expect(seg.word_count).toBeGreaterThan(0);
      expect(seg.video_start_ms).toBeGreaterThanOrEqual(0);
      expect(seg.video_end_ms).toBeGreaterThan(seg.video_start_ms);
    }
  });

  // Sprint 13: Transitions endpoint
  test('GET /demo/transitions returns transitions JSON', async () => {
    const res = await request(app, '/demo/transitions');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    const data = JSON.parse(res.body);
    expect(data.transitions).toHaveLength(7);
    expect(data.validation.valid).toBe(true);
  });

  test('transitions have correct types and durations', async () => {
    const res = await request(app, '/demo/transitions');
    const data = JSON.parse(res.body);
    for (const t of data.transitions) {
      expect(t.to_scene_id).toBeDefined();
      expect(t.duration_ms).toBeGreaterThanOrEqual(500);
      expect(t.duration_ms).toBeLessThanOrEqual(1500);
      expect(['fade', 'slide-left', 'slide-up', 'zoom', 'none']).toContain(t.type);
    }
  });

  // Sprint 13: Recording pipeline endpoints
  test('GET /demo/record/status returns idle when no recording active', async () => {
    const res = await request(app, '/demo/record/status');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe('idle');
    expect(data.message).toContain('No recording in progress');
  });
});
