/**
 * Scene Transition Effects for Demo Video
 *
 * Defines transition types, durations, and easing for each scene change.
 * Used by the video assembly pipeline (ffmpeg) and the walkthrough page.
 *
 * Transition types:
 * - fade: Cross-fade between scenes (default)
 * - slide-left: Slide incoming scene from right
 * - slide-up: Slide incoming scene from bottom
 * - zoom: Zoom into the next scene
 * - none: Hard cut (no transition)
 */

export type TransitionType = 'fade' | 'slide-left' | 'slide-up' | 'zoom' | 'none';
export type EasingFunction = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear';

export interface SceneTransition {
  /** Scene ID this transition leads INTO */
  to_scene_id: string;
  /** Scene order number */
  to_scene_order: number;
  /** Transition type */
  type: TransitionType;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Easing function */
  easing: EasingFunction;
  /** Whether this scene starts from black (intro) */
  from_black: boolean;
  /** Whether this scene ends to black (outro) */
  to_black: boolean;
}

/**
 * Default transition definitions for the 7-scene demo.
 *
 * Design choices:
 * - Scene 1 fades in from black (intro)
 * - Scenes 2-6 use varied transitions for visual interest
 * - Scene 7 fades out to black (outro)
 * - Transition durations are between 800-1200ms
 */
export const SCENE_TRANSITIONS: SceneTransition[] = [
  {
    to_scene_id: 'marketplace-overview',
    to_scene_order: 1,
    type: 'fade',
    duration_ms: 1200,
    easing: 'ease-in',
    from_black: true,
    to_black: false,
  },
  {
    to_scene_id: 'seed-agents',
    to_scene_order: 2,
    type: 'fade',
    duration_ms: 800,
    easing: 'ease-in-out',
    from_black: false,
    to_black: false,
  },
  {
    to_scene_id: 'browse-marketplace',
    to_scene_order: 3,
    type: 'slide-left',
    duration_ms: 1000,
    easing: 'ease-in-out',
    from_black: false,
    to_black: false,
  },
  {
    to_scene_id: 'agent-detail',
    to_scene_order: 4,
    type: 'zoom',
    duration_ms: 900,
    easing: 'ease-out',
    from_black: false,
    to_black: false,
  },
  {
    to_scene_id: 'hire-agent',
    to_scene_order: 5,
    type: 'slide-left',
    duration_ms: 1000,
    easing: 'ease-in-out',
    from_black: false,
    to_black: false,
  },
  {
    to_scene_id: 'task-completion',
    to_scene_order: 6,
    type: 'fade',
    duration_ms: 800,
    easing: 'ease-in-out',
    from_black: false,
    to_black: false,
  },
  {
    to_scene_id: 'rating-points',
    to_scene_order: 7,
    type: 'fade',
    duration_ms: 1200,
    easing: 'ease-out',
    from_black: false,
    to_black: true,
  },
];

/**
 * Get the transition for a specific scene.
 */
export function getTransitionForScene(sceneId: string): SceneTransition | undefined {
  return SCENE_TRANSITIONS.find(t => t.to_scene_id === sceneId);
}

/**
 * Get transitions in order.
 */
export function getTransitionsInOrder(): SceneTransition[] {
  return [...SCENE_TRANSITIONS].sort((a, b) => a.to_scene_order - b.to_scene_order);
}

/**
 * Get total transition time (sum of all transition durations).
 */
export function getTotalTransitionTime(): number {
  return SCENE_TRANSITIONS.reduce((sum, t) => sum + t.duration_ms, 0);
}

/**
 * Generate an ffmpeg filter string for a transition between two frames.
 * This creates the filter_complex argument for video assembly.
 */
export function generateFfmpegTransitionFilter(
  transition: SceneTransition,
  inputIndex: number,
): string {
  const dur = transition.duration_ms / 1000; // ffmpeg uses seconds

  switch (transition.type) {
    case 'fade':
      if (transition.from_black) {
        return `[${inputIndex}:v]fade=t=in:st=0:d=${dur}[v${inputIndex}]`;
      }
      if (transition.to_black) {
        return `[${inputIndex}:v]fade=t=out:st=0:d=${dur}[v${inputIndex}]`;
      }
      return `[${inputIndex}:v]fade=t=in:st=0:d=${dur}[v${inputIndex}]`;

    case 'slide-left':
      return `[${inputIndex}:v]crop=iw:ih:0:0[v${inputIndex}]`;

    case 'slide-up':
      return `[${inputIndex}:v]crop=iw:ih:0:0[v${inputIndex}]`;

    case 'zoom':
      return `[${inputIndex}:v]zoompan=z='min(zoom+0.001,1.2)':d=${Math.round(dur * 25)}:s=1920x1080[v${inputIndex}]`;

    case 'none':
    default:
      return `[${inputIndex}:v]null[v${inputIndex}]`;
  }
}

/**
 * Validate all transitions are properly configured.
 */
export function validateTransitions(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check we have transitions for all 7 scenes
  if (SCENE_TRANSITIONS.length !== 7) {
    errors.push(`Expected 7 transitions, found ${SCENE_TRANSITIONS.length}`);
  }

  // Check first scene fades in from black
  const first = SCENE_TRANSITIONS.find(t => t.to_scene_order === 1);
  if (!first?.from_black) {
    errors.push('First scene should fade in from black');
  }

  // Check last scene fades out to black
  const last = SCENE_TRANSITIONS.find(t => t.to_scene_order === 7);
  if (!last?.to_black) {
    errors.push('Last scene should fade out to black');
  }

  // Check duration bounds (500-1500ms)
  for (const t of SCENE_TRANSITIONS) {
    if (t.duration_ms < 500 || t.duration_ms > 1500) {
      errors.push(`Transition to ${t.to_scene_id}: duration ${t.duration_ms}ms outside 500-1500ms range`);
    }
  }

  // Check order continuity
  const orders = SCENE_TRANSITIONS.map(t => t.to_scene_order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      errors.push(`Missing transition for scene order ${i + 1}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
