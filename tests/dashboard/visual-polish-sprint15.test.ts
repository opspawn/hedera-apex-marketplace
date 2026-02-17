/**
 * Sprint 15: Dashboard Visual Polish Tests
 *
 * Tests for:
 * - Hero stats: 30px bold numbers, gradient accent bars, stat icons
 * - Agent cards: emoji avatars, color-coded skill tags (6 variants)
 * - Activity feed: hover states, timestamp pills, event type indicators
 * - Registration form: 3-step indicators with labels, focus glow
 * - Category filter: pill/chip style buttons with active state
 * - Dark theme CSS variables consistency
 * - No raw JSON visible in UI
 */

import { createApp } from '../../src/index';
import { Express } from 'express';

async function getHTML(app: Express, path: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
        const text = await res.text();
        resolve(text);
      } finally {
        server.close();
      }
    });
  });
}

describe('Sprint 15: Stat Cards Visual Polish', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('stat values use 30px bold font', () => {
    expect(html).toContain('font-size: 30px');
    expect(html).toContain('font-weight: 800');
  });

  test('stat cards have gradient accent bars via ::before', () => {
    expect(html).toContain('.stat-card::before');
    expect(html).toContain('height: 3px');
  });

  test('first stat card has cyan gradient accent', () => {
    expect(html).toContain('.stat-card:nth-child(1)::before');
    expect(html).toContain('#00d4ff, #0088cc');
  });

  test('second stat card has purple gradient accent', () => {
    expect(html).toContain('.stat-card:nth-child(2)::before');
    expect(html).toContain('#a855f7, #7c3aed');
  });

  test('third stat card has green gradient accent', () => {
    expect(html).toContain('.stat-card:nth-child(3)::before');
    expect(html).toContain('#00c853, #00a040');
  });

  test('fourth stat card has amber gradient accent', () => {
    expect(html).toContain('.stat-card:nth-child(4)::before');
    expect(html).toContain('#ffaa00, #ff8800');
  });

  test('stat cards have colored values per card', () => {
    expect(html).toContain('.stat-card:nth-child(2) .value { color: #a855f7');
    expect(html).toContain('.stat-card:nth-child(3) .value { color: #00c853');
    expect(html).toContain('.stat-card:nth-child(4) .value { color: #ffaa00');
  });

  test('stat cards have stat-icon elements', () => {
    expect(html).toContain('class="stat-icon"');
    expect(html).toContain('.stat-card .stat-icon');
  });

  test('stat cards have emoji icons', () => {
    // Robot, puzzle, check, chart
    expect(html).toContain('&#x1F916;');
    expect(html).toContain('&#x1F9E9;');
    expect(html).toContain('&#x2705;');
    expect(html).toContain('&#x1F4C8;');
  });

  test('stat icon is positioned top-right with opacity', () => {
    expect(html).toContain('position: absolute');
    expect(html).toContain('opacity: 0.3');
  });

  test('stat cards have overflow hidden for accent bar', () => {
    expect(html).toContain('overflow: hidden');
  });

  test('stat cards have larger padding', () => {
    expect(html).toContain('padding: 1.5rem');
  });
});

describe('Sprint 15: Agent Cards — Emoji Avatars', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('agent-avatar CSS class exists', () => {
    expect(html).toContain('.agent-avatar');
  });

  test('agent-avatar has rounded border and size', () => {
    expect(html).toContain('width: 38px');
    expect(html).toContain('height: 38px');
    expect(html).toContain('border-radius: 10px');
  });

  test('agent-avatar has gradient background', () => {
    expect(html).toContain('linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(168, 85, 247, 0.15))');
  });

  test('agent-name-group CSS class exists', () => {
    expect(html).toContain('.agent-name-group');
  });

  test('AGENT_EMOJIS array exists in JS', () => {
    expect(html).toContain('AGENT_EMOJIS');
  });

  test('getAgentEmoji function exists', () => {
    expect(html).toContain('function getAgentEmoji');
  });

  test('agent card renders agent-avatar div', () => {
    expect(html).toContain('agent-avatar');
  });
});

describe('Sprint 15: Color-Coded Skill Tags', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('skill tags have pill shape (border-radius: 20px)', () => {
    expect(html).toContain('.skill-tag');
    expect(html).toContain('border-radius: 20px');
  });

  test('6 color variants exist (skill-tag-0 through skill-tag-5)', () => {
    expect(html).toContain('.skill-tag-0');
    expect(html).toContain('.skill-tag-1');
    expect(html).toContain('.skill-tag-2');
    expect(html).toContain('.skill-tag-3');
    expect(html).toContain('.skill-tag-4');
    expect(html).toContain('.skill-tag-5');
  });

  test('variant 0 is blue', () => {
    expect(html).toContain('.skill-tag-0 { background: rgba(0, 136, 204, 0.15); color: #00aaff');
  });

  test('variant 1 is purple', () => {
    expect(html).toContain('.skill-tag-1 { background: rgba(168, 85, 247, 0.15); color: #c084fc');
  });

  test('variant 2 is green', () => {
    expect(html).toContain('.skill-tag-2 { background: rgba(0, 200, 83, 0.15); color: #34d399');
  });

  test('variant 3 is amber', () => {
    expect(html).toContain('.skill-tag-3 { background: rgba(255, 170, 0, 0.15); color: #fbbf24');
  });

  test('variant 4 is rose', () => {
    expect(html).toContain('.skill-tag-4 { background: rgba(244, 63, 94, 0.15); color: #fb7185');
  });

  test('variant 5 is sky', () => {
    expect(html).toContain('.skill-tag-5 { background: rgba(56, 189, 248, 0.15); color: #38bdf8');
  });

  test('skill tags hover has brightness filter', () => {
    expect(html).toContain('.skill-tag:hover');
    expect(html).toContain('filter: brightness(1.2)');
  });

  test('skill tags render with modulo-based color class', () => {
    expect(html).toContain("skill-tag skill-tag-' + (i % 6)");
  });
});

describe('Sprint 15: Activity Feed Polish', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('feed items have enhanced hover state', () => {
    expect(html).toContain('.feed-item:hover');
    expect(html).toContain('transform: translateX(4px)');
  });

  test('feed items change background on hover', () => {
    expect(html).toContain('background: #131d2f');
  });

  test('feed-type-pill CSS class exists', () => {
    expect(html).toContain('.feed-type-pill');
  });

  test('type pills have color variants', () => {
    expect(html).toContain('.feed-type-pill.register');
    expect(html).toContain('.feed-type-pill.skill');
    expect(html).toContain('.feed-type-pill.hire');
  });

  test('type pills are uppercase with letter-spacing', () => {
    expect(html).toContain('text-transform: uppercase');
    expect(html).toContain('letter-spacing: 0.04em');
  });

  test('timestamp uses pill style', () => {
    expect(html).toContain('.feed-time');
    expect(html).toContain('border-radius: 8px');
    expect(html).toContain('background: #0d1528');
  });

  test('renderActivity includes type pills', () => {
    expect(html).toContain('feed-type-pill');
    expect(html).toContain('typeLabels');
  });

  test('typeLabels map exists in JS', () => {
    expect(html).toContain("typeLabels = { register: 'Register', skill: 'Skill', hire: 'Hire' }");
  });
});

describe('Sprint 15: Registration Form — 3-Step Progress', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('registration has exactly 3 progress steps', () => {
    expect(html).toContain('id="reg-step-1"');
    expect(html).toContain('id="reg-step-2"');
    expect(html).toContain('id="reg-step-3"');
    expect(html).not.toContain('id="reg-step-4"');
  });

  test('steps have bar and label sub-elements', () => {
    expect(html).toContain('class="step-bar"');
    expect(html).toContain('class="step-label"');
  });

  test('step labels are Identity, Details, Skills', () => {
    expect(html).toContain('Identity');
    expect(html).toContain('Details');
    expect(html).toContain('Skills');
  });

  test('step bar CSS styles exist', () => {
    expect(html).toContain('.register-step .step-bar');
    expect(html).toContain('.register-step .step-label');
  });

  test('filled step bar has gradient', () => {
    expect(html).toContain('.register-step.filled .step-bar');
    expect(html).toContain('linear-gradient(90deg, #00d4ff, #00aaff)');
  });

  test('filled step label turns cyan', () => {
    expect(html).toContain('.register-step.filled .step-label { color: #00d4ff');
  });

  test('updateRegProgress uses 3 step groups', () => {
    expect(html).toContain('stepGroups');
    expect(html).toContain("'reg-name', 'reg-endpoint'");
    expect(html).toContain("'reg-description'");
  });

  test('inputs have enhanced focus glow', () => {
    expect(html).toContain('0 0 20px rgba(0, 212, 255, 0.08)');
  });

  test('invalid inputs have red glow', () => {
    expect(html).toContain('0 0 0 3px rgba(255, 68, 68, 0.1)');
  });

  test('valid inputs have green glow', () => {
    expect(html).toContain('0 0 0 3px rgba(0, 200, 83, 0.1)');
  });
});

describe('Sprint 15: Category Filter Chips', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('category-chips container exists', () => {
    expect(html).toContain('id="category-chips"');
    expect(html).toContain('class="category-chips"');
  });

  test('category-chip CSS class exists', () => {
    expect(html).toContain('.category-chip');
  });

  test('chips have pill shape (border-radius: 20px)', () => {
    expect(html).toContain('.category-chip {');
    expect(html).toMatch(/\.category-chip\s*\{[^}]*border-radius:\s*20px/);
  });

  test('active chip has cyan styling', () => {
    expect(html).toContain('.category-chip.active');
    expect(html).toContain('background: rgba(0, 212, 255, 0.15)');
  });

  test('chip hover has border-color change', () => {
    expect(html).toContain('.category-chip:hover');
    expect(html).toContain('border-color: #00d4ff');
  });

  test('All chip is active by default', () => {
    expect(html).toContain('category-chip active" data-category=""');
  });

  test('chips include standard categories', () => {
    expect(html).toContain('data-category="nlp"');
    expect(html).toContain('data-category="analytics"');
    expect(html).toContain('data-category="automation"');
    expect(html).toContain('data-category="blockchain"');
    expect(html).toContain('data-category="ai"');
    expect(html).toContain('data-category="security"');
  });

  test('filterByCategory function exists', () => {
    expect(html).toContain('function filterByCategory');
  });

  test('chips trigger filterByCategory on click', () => {
    expect(html).toContain('onclick="filterByCategory(this)"');
  });

  test('category chips have group role for accessibility', () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Category filters"');
  });
});

describe('Sprint 15: Version & Meta', () => {
  let app: Express;
  let html: string;

  beforeAll(async () => {
    ({ app } = createApp());
    html = await getHTML(app, '/');
  });

  test('dashboard has proper title', () => {
    expect(html).toContain('<title>Hedera Agent Marketplace</title>');
  });

  test('dashboard has viewport meta', () => {
    expect(html).toContain('viewport');
  });

  test('dark theme body uses correct background', () => {
    expect(html).toContain('background: #080c14');
  });

  test('header has gradient background', () => {
    expect(html).toContain('.header { background: linear-gradient');
  });

  test('no raw JSON visible in initial HTML', () => {
    // The HTML should not contain raw { "key": "value" } JSON blobs
    const jsonPattern = /"[a-z_]+"\s*:\s*"[^"]+"/;
    // Extract just the visible HTML content (not script/style)
    const bodyContent = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    // Should not have JSON object literals in visible content
    expect(bodyContent).not.toMatch(/\{"[a-z_]+":/);
  });

  test('all standard badge labels are present in header', () => {
    expect(html).toContain('HCS-10</span>');
    expect(html).toContain('HCS-11</span>');
    expect(html).toContain('HCS-14</span>');
    expect(html).toContain('HCS-19</span>');
    expect(html).toContain('HCS-20</span>');
    expect(html).toContain('HCS-26</span>');
  });
});
