/**
 * Video Scene Definitions — 7 scenes for Hedera Apex demo video
 *
 * Each scene maps to a dashboard view with specific actions,
 * Playwright recording instructions, and overlay metadata.
 *
 * Scenes:
 * 1. Dashboard Overview (marketplace stats, agent counts)
 * 2. Agent Registry (browse available agents by category)
 * 3. Agent Detail (HCS-19 privacy compliance + skills)
 * 4. Hire Agent flow (task request + x402 payment modal)
 * 5. Activity Feed (HCS transaction messages, real-time updates)
 * 6. HOL Registry tab (Registry Broker status + connections)
 * 7. Register Agent form (registration flow)
 */

import { TextOverlay, SceneAction } from './scene-definitions';

export interface VideoScene {
  id: string;
  order: number;
  title: string;
  overlayTitle: string;
  description: string;
  /** Duration of this scene in seconds */
  duration_s: number;
  hcs_standards: string[];
  overlays: TextOverlay[];
  actions: SceneAction[];
  narration: string;
}

export const VIDEO_SCENES: VideoScene[] = [
  {
    id: 'dashboard-overview',
    order: 1,
    title: 'Dashboard Overview',
    overlayTitle: 'Agent Marketplace Dashboard',
    description: 'Marketplace stats: agent counts, standards supported, real-time health status',
    duration_s: 8,
    hcs_standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
    overlays: [
      { text: 'Hedera Agent Marketplace', position: 'top-center', style: 'title' },
      { text: '6 HCS Standards · Decentralized Agent Discovery', position: 'bottom-center', style: 'subtitle' },
      { text: '6 Standards', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 3000 },
    ],
    narration: 'The Hedera Agent Marketplace — a decentralized platform for AI agent discovery, hiring, and reputation built on 6 HCS standards.',
  },
  {
    id: 'agent-registry',
    order: 2,
    title: 'Agent Registry',
    overlayTitle: 'Browse Agent Registry',
    description: 'Browse available agents by category, search by skill or name',
    duration_s: 8,
    hcs_standards: ['HCS-10', 'HCS-11', 'HCS-26'],
    overlays: [
      { text: 'Agent Registry', position: 'top-center', style: 'title' },
      { text: 'Browse agents by category, skill, or reputation', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-26 Skills', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="marketplace"]' },
      { type: 'wait', waitMs: 2000 },
      { type: 'type', target: '#search', value: 'security' },
      { type: 'wait', waitMs: 1500 },
    ],
    narration: 'Agents are registered with HCS-11 profiles and HCS-26 skill manifests. Browse by category, search by keyword, filter by reputation.',
  },
  {
    id: 'agent-detail',
    order: 3,
    title: 'Agent Detail',
    overlayTitle: 'Agent Profile & Skills',
    description: 'View agent profile with HCS-19 privacy compliance, skills, and reputation',
    duration_s: 8,
    hcs_standards: ['HCS-11', 'HCS-19', 'HCS-26', 'HCS-20'],
    overlays: [
      { text: 'Agent Detail', position: 'top-center', style: 'title' },
      { text: 'HCS-19 Privacy · HCS-26 Skills · HCS-20 Points', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-19 Verified', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="marketplace"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '.agent-card' },
      { type: 'wait', waitMs: 2000 },
    ],
    narration: 'Each agent has an HCS-11 structured profile, HCS-19 privacy consent verification, published HCS-26 skills, and HCS-20 reputation points.',
  },
  {
    id: 'hire-agent',
    order: 4,
    title: 'Hire Agent Flow',
    overlayTitle: 'Hire Agent for Task',
    description: 'Submit a task request with x402 payment modal',
    duration_s: 10,
    hcs_standards: ['HCS-10', 'HCS-14', 'HCS-20'],
    overlays: [
      { text: 'Hire Agent', position: 'top-center', style: 'title' },
      { text: 'Task submission · HCS-10 messaging · x402 payment', position: 'bottom-center', style: 'subtitle' },
      { text: 'x402 Payment', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="marketplace"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '.btn-hire' },
      { type: 'wait', waitMs: 1000 },
      { type: 'type', target: '#hire-client', value: '0.0.demo-client' },
      { type: 'type', target: '#hire-input', value: '{"task": "Security audit of smart contract"}' },
      { type: 'wait', waitMs: 2000 },
    ],
    narration: 'Hiring creates a task via HCS-10 messaging, verifies agent identity with HCS-14, and handles payment through x402 micropayments.',
  },
  {
    id: 'activity-feed',
    order: 5,
    title: 'Activity Feed',
    overlayTitle: 'HCS Activity Feed',
    description: 'Show HCS transaction messages and real-time updates',
    duration_s: 8,
    hcs_standards: ['HCS-10', 'HCS-20'],
    overlays: [
      { text: 'Activity Feed', position: 'top-center', style: 'title' },
      { text: 'Real-time HCS transaction messages', position: 'bottom-center', style: 'subtitle' },
      { text: 'HCS-10 Topics', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="demo"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'api-call', target: '/api/demo/run', value: 'POST' },
      { type: 'wait', waitMs: 3000 },
    ],
    narration: 'The activity feed shows real-time HCS-10 topic messages — agent registrations, task assignments, completions, and reputation updates.',
  },
  {
    id: 'hol-registry',
    order: 6,
    title: 'HOL Registry',
    overlayTitle: 'HOL Registry Broker',
    description: 'Registry Broker status, connected agents, HOL integration',
    duration_s: 8,
    hcs_standards: ['HCS-10', 'HCS-11'],
    overlays: [
      { text: 'HOL Registry', position: 'top-center', style: 'title' },
      { text: 'Registry Broker · Hashgraph Online integration', position: 'bottom-center', style: 'subtitle' },
      { text: 'HOL Broker', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="registry"]' },
      { type: 'wait', waitMs: 2500 },
    ],
    narration: 'The HOL Registry Broker connects to the Hashgraph Online network, enabling cross-marketplace agent discovery and interoperability.',
  },
  {
    id: 'register-agent',
    order: 7,
    title: 'Register Agent',
    overlayTitle: 'Register New Agent',
    description: 'Agent registration form with HCS identity creation',
    duration_s: 10,
    hcs_standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19'],
    overlays: [
      { text: 'Register Agent', position: 'top-center', style: 'title' },
      { text: 'Full HCS identity: HCS-10 · HCS-11 · HCS-14 · HCS-19', position: 'bottom-center', style: 'subtitle' },
      { text: 'New Agent', position: 'top-right', style: 'badge' },
    ],
    actions: [
      { type: 'navigate', target: '/' },
      { type: 'wait', waitMs: 1000 },
      { type: 'click', target: '[data-view="register"]' },
      { type: 'wait', waitMs: 1000 },
      { type: 'type', target: '#reg-name', value: 'DeepAnalyzer' },
      { type: 'type', target: '#reg-desc', value: 'Advanced data analysis agent for financial markets' },
      { type: 'wait', waitMs: 2000 },
      { type: 'scroll', target: '#register-form' },
      { type: 'wait', waitMs: 1500 },
    ],
    narration: 'New agents register with full HCS identities — HCS-10 communication topics, HCS-11 profiles, HCS-14 DIDs, and HCS-19 privacy consent.',
  },
];

/**
 * Total video duration in seconds (excluding transitions and title/end cards).
 */
export function getVideoTotalDuration(): number {
  return VIDEO_SCENES.reduce((sum, s) => sum + s.duration_s, 0);
}

/**
 * Get all unique standards across all video scenes.
 */
export function getVideoAllStandards(): string[] {
  const standards = new Set<string>();
  for (const scene of VIDEO_SCENES) {
    for (const std of scene.hcs_standards) {
      standards.add(std);
    }
  }
  return Array.from(standards).sort();
}

/**
 * Get video scenes in order.
 */
export function getVideoScenesInOrder(): VideoScene[] {
  return [...VIDEO_SCENES].sort((a, b) => a.order - b.order);
}
