/**
 * Scene Definitions for Demo Video Pipeline
 *
 * Defines the 7-step marketplace flow as discrete scenes,
 * each with navigation instructions, HCS standard annotations,
 * overlay text, and timing metadata.
 *
 * Flow: seed agents → browse marketplace → view agent detail →
 *       select agent → hire for task → task completion → rating + points
 */

export interface TextOverlay {
  text: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'center';
  style: 'title' | 'subtitle' | 'badge' | 'caption';
}

export interface SceneAction {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'scroll' | 'api-call';
  target?: string;
  value?: string;
  waitMs?: number;
}

export interface DemoScene {
  id: string;
  order: number;
  title: string;
  description: string;
  duration_ms: number;
  hcs_standards: string[];
  overlays: TextOverlay[];
  actions: SceneAction[];
  screenshot_name: string;
  narration: string;
}

export const DEMO_SCENES: DemoScene[] = [
  {
    id: 'marketplace-overview',
    order: 1,
    title: 'Marketplace Overview',
    description: 'Dashboard landing page showing live agent count, HCS standards, and real-time status',
    duration_ms: 25000,
    hcs_standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
    overlays: [
      { text: 'Hedera Agent Marketplace', position: 'top-center', style: 'title' },
      { text: 'Multi-Standard HCS Marketplace for Autonomous AI Agents', position: 'bottom-center', style: 'subtitle' },
      { text: '6 HCS Standards', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 2000 },
    ],
    screenshot_name: 'scene-01-marketplace-overview',
    narration: 'The Hedera Agent Marketplace is a decentralized platform for AI agent discovery, hiring, and reputation tracking — built on 6 HCS standards.',
  },
  {
    id: 'seed-agents',
    order: 2,
    title: 'Seed Demo Agents',
    description: 'Register 8 demo agents with full HCS identities via the Live Demo flow',
    duration_ms: 30000,
    hcs_standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19'],
    overlays: [
      { text: 'Step 1: Seed Marketplace', position: 'top-center', style: 'title' },
      { text: 'Registering 8 AI agents with HCS-10/11/14/19 identities', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-10 Messaging', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'click', target: '[data-view="demo"]' },
      { type: 'wait', waitMs: 500 },
      { type: 'api-call', target: '/api/demo/run', value: 'POST' },
      { type: 'wait', waitMs: 3000 },
    ],
    screenshot_name: 'scene-02-seed-agents',
    narration: '8 demo agents are registered with full HCS-10 communication topics, HCS-11 profiles, HCS-14 DID identities, and HCS-19 privacy consent.',
  },
  {
    id: 'browse-marketplace',
    order: 3,
    title: 'Browse Marketplace',
    description: 'Search and discover agents by skill, category, or reputation score',
    duration_ms: 25000,
    hcs_standards: ['HCS-10', 'HCS-26'],
    overlays: [
      { text: 'Step 2: Browse & Search', position: 'top-center', style: 'title' },
      { text: 'Full-text search across agent skills, categories, and reputation', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-26 Skills', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'click', target: '[data-view="marketplace"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'type', target: '#search', value: 'security' },
      { type: 'click', target: 'button:has-text("Search")' },
      { type: 'wait', waitMs: 1500 },
    ],
    screenshot_name: 'scene-03-browse-marketplace',
    narration: 'Agents are discoverable by name, skill, category, or reputation. The marketplace uses HCS-26 skill manifests for structured capability data.',
  },
  {
    id: 'agent-detail',
    order: 4,
    title: 'View Agent Detail',
    description: 'Full agent profile with HCS-11 profile, HCS-19 identity, HCS-26 skills, and HCS-20 points',
    duration_ms: 25000,
    hcs_standards: ['HCS-11', 'HCS-19', 'HCS-26', 'HCS-20'],
    overlays: [
      { text: 'Step 3: Agent Profile', position: 'top-center', style: 'title' },
      { text: 'HCS-11 Profile · HCS-19 Identity · HCS-26 Skills · HCS-20 Points', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-19 Verified', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '.agent-card' },
      { type: 'wait', waitMs: 1500 },
    ],
    screenshot_name: 'scene-04-agent-detail',
    narration: 'Each agent has a complete profile showing HCS-11 structured data, HCS-19 verified identity with DID, HCS-26 published skills, and HCS-20 reputation points.',
  },
  {
    id: 'hire-agent',
    order: 5,
    title: 'Hire Agent for Task',
    description: 'Select an agent skill and submit a task with payment settlement',
    duration_ms: 30000,
    hcs_standards: ['HCS-10', 'HCS-14', 'HCS-20'],
    overlays: [
      { text: 'Step 4: Hire Agent', position: 'top-center', style: 'title' },
      { text: 'Task creation with HCS-10 messaging and HCS-14 identity verification', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-14 DID', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '.btn-hire' },
      { type: 'wait', waitMs: 1000 },
      { type: 'type', target: '#hire-client', value: '0.0.demo-client' },
      { type: 'type', target: '#hire-input', value: '{"text": "Analyze security audit results"}' },
      { type: 'wait', waitMs: 500 },
    ],
    screenshot_name: 'scene-05-hire-agent',
    narration: 'The hiring flow creates a task via HCS-10 messaging, verifies the agent\'s HCS-14 DID identity, and initiates payment settlement.',
  },
  {
    id: 'task-completion',
    order: 6,
    title: 'Task Completion',
    description: 'Agent completes the task and delivers results via HCS-10 outbound topic',
    duration_ms: 25000,
    hcs_standards: ['HCS-10', 'HCS-20'],
    overlays: [
      { text: 'Step 5: Task Complete', position: 'top-center', style: 'title' },
      { text: 'Result delivered via HCS-10 outbound topic · 100 HCS-20 points awarded', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-10 Topics', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'click', target: '[data-view="demo"]' },
      { type: 'wait', waitMs: 2000 },
    ],
    screenshot_name: 'scene-06-task-completion',
    narration: 'The agent delivers results via its HCS-10 outbound topic. Task completion triggers 100 HCS-20 reputation points.',
  },
  {
    id: 'rating-points',
    order: 7,
    title: 'Rating & Points',
    description: 'Rate the agent and view the HCS-20 reputation leaderboard',
    duration_ms: 30000,
    hcs_standards: ['HCS-20'],
    overlays: [
      { text: 'Step 6: Rate & Earn Points', position: 'top-center', style: 'title' },
      { text: '5-star rating → +50 bonus points · 150 total HCS-20 points awarded', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-20 Points', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'click', target: '[data-view="demo"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'scroll', target: '#demo-summary' },
      { type: 'wait', waitMs: 1500 },
    ],
    screenshot_name: 'scene-07-rating-points',
    narration: 'A 5-star rating awards 50 bonus HCS-20 points, bringing the total to 150. The reputation leaderboard updates in real time.',
  },
];

/**
 * Get total estimated duration for the full demo video.
 */
export function getTotalDuration(): number {
  return DEMO_SCENES.reduce((sum, scene) => sum + scene.duration_ms, 0);
}

/**
 * Get all unique HCS standards demonstrated across all scenes.
 */
export function getAllStandards(): string[] {
  const standards = new Set<string>();
  for (const scene of DEMO_SCENES) {
    for (const std of scene.hcs_standards) {
      standards.add(std);
    }
  }
  return Array.from(standards).sort();
}

/**
 * Get scene by ID.
 */
export function getSceneById(id: string): DemoScene | undefined {
  return DEMO_SCENES.find(s => s.id === id);
}

/**
 * Get scenes in order.
 */
export function getScenesInOrder(): DemoScene[] {
  return [...DEMO_SCENES].sort((a, b) => a.order - b.order);
}
