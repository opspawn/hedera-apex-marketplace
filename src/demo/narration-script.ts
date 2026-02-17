/**
 * Narration Script for Demo Video
 *
 * Maps each scene to narration text with precise timestamps.
 * Used for subtitle generation and voiceover alignment.
 *
 * Timing guidelines:
 * - Average speaking rate: ~150 words per minute
 * - Each scene's narration must fit within its duration_ms
 * - Timestamps are relative to scene start (not video start)
 */

import { DEMO_SCENES, getScenesInOrder, getTotalDuration } from './scene-definitions';

export interface NarrationSegment {
  scene_id: string;
  scene_order: number;
  scene_title: string;
  /** Offset from video start in milliseconds */
  video_start_ms: number;
  /** Offset from video start in milliseconds */
  video_end_ms: number;
  /** Duration of this segment in milliseconds */
  duration_ms: number;
  /** Primary narration text (for voiceover) */
  narration: string;
  /** Word count for pacing validation */
  word_count: number;
  /** Estimated speaking duration at 150 wpm */
  estimated_speaking_ms: number;
  /** Whether narration fits within the scene duration */
  fits_duration: boolean;
  /** Key terms to emphasize */
  key_terms: string[];
  /** HCS standards referenced */
  hcs_standards: string[];
}

export interface NarrationScript {
  title: string;
  version: string;
  total_duration_ms: number;
  total_duration_formatted: string;
  segments: NarrationSegment[];
  summary: {
    total_segments: number;
    total_words: number;
    estimated_total_speaking_ms: number;
    all_segments_fit: boolean;
    standards_covered: string[];
  };
}

const WORDS_PER_MINUTE = 150;
const MS_PER_WORD = 60000 / WORDS_PER_MINUTE; // 400ms per word

/**
 * Extract key terms from narration text.
 * Identifies HCS standards and technical terms.
 */
function extractKeyTerms(narration: string): string[] {
  const terms: string[] = [];
  // HCS standards
  const hcsMatches = narration.match(/HCS-\d+/g);
  if (hcsMatches) terms.push(...new Set(hcsMatches));
  // Technical terms
  const technicalTerms = [
    'marketplace', 'decentralized', 'reputation', 'DID', 'identity',
    'privacy', 'consent', 'skill', 'manifest', 'leaderboard',
    'topic', 'agent', 'points', 'registration', 'verification',
  ];
  for (const term of technicalTerms) {
    if (narration.toLowerCase().includes(term.toLowerCase())) {
      terms.push(term);
    }
  }
  return [...new Set(terms)];
}

/**
 * Format milliseconds as M:SS.
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Build the full narration script from scene definitions.
 */
export function buildNarrationScript(): NarrationScript {
  const scenes = getScenesInOrder();
  const segments: NarrationSegment[] = [];
  let videoOffset = 0;
  let totalWords = 0;
  let totalSpeakingMs = 0;
  let allFit = true;

  for (const scene of scenes) {
    const wordCount = scene.narration.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedSpeakingMs = Math.round(wordCount * MS_PER_WORD);
    const fitsDuration = estimatedSpeakingMs <= scene.duration_ms;
    if (!fitsDuration) allFit = false;

    const hcsStandards = scene.hcs_standards;
    const keyTerms = extractKeyTerms(scene.narration);

    segments.push({
      scene_id: scene.id,
      scene_order: scene.order,
      scene_title: scene.title,
      video_start_ms: videoOffset,
      video_end_ms: videoOffset + scene.duration_ms,
      duration_ms: scene.duration_ms,
      narration: scene.narration,
      word_count: wordCount,
      estimated_speaking_ms: estimatedSpeakingMs,
      fits_duration: fitsDuration,
      key_terms: keyTerms,
      hcs_standards: hcsStandards,
    });

    totalWords += wordCount;
    totalSpeakingMs += estimatedSpeakingMs;
    videoOffset += scene.duration_ms;
  }

  const allStandards = new Set<string>();
  for (const seg of segments) {
    for (const std of seg.hcs_standards) {
      allStandards.add(std);
    }
  }

  return {
    title: 'Hedera Agent Marketplace — Demo Narration Script',
    version: '0.14.0',
    total_duration_ms: getTotalDuration(),
    total_duration_formatted: formatDuration(getTotalDuration()),
    segments,
    summary: {
      total_segments: segments.length,
      total_words: totalWords,
      estimated_total_speaking_ms: totalSpeakingMs,
      all_segments_fit: allFit,
      standards_covered: Array.from(allStandards).sort(),
    },
  };
}

/**
 * Get narration segment by scene ID.
 */
export function getNarrationForScene(sceneId: string): NarrationSegment | undefined {
  const script = buildNarrationScript();
  return script.segments.find(s => s.scene_id === sceneId);
}

/**
 * Get the narration segment active at a given video timestamp.
 */
export function getNarrationAtTime(videoMs: number): NarrationSegment | undefined {
  const script = buildNarrationScript();
  return script.segments.find(s => videoMs >= s.video_start_ms && videoMs < s.video_end_ms);
}

/**
 * Generate a plain-text narration script for voiceover reference.
 */
export function generatePlainTextScript(): string {
  const script = buildNarrationScript();
  const lines: string[] = [
    `# ${script.title}`,
    `# Total Duration: ${script.total_duration_formatted}`,
    `# Total Words: ${script.summary.total_words}`,
    '',
  ];

  for (const seg of script.segments) {
    const startFormatted = formatDuration(seg.video_start_ms);
    const endFormatted = formatDuration(seg.video_end_ms);
    lines.push(`## Scene ${seg.scene_order}: ${seg.scene_title}`);
    lines.push(`## [${startFormatted} - ${endFormatted}] (${seg.duration_ms / 1000}s)`);
    lines.push('');
    lines.push(seg.narration);
    lines.push('');
    lines.push(`Key: ${seg.key_terms.join(', ')}`);
    lines.push(`Standards: ${seg.hcs_standards.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}
