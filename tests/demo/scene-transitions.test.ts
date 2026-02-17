/**
 * Tests for Scene Transitions module.
 */

import {
  SCENE_TRANSITIONS,
  SceneTransition,
  TransitionType,
  getTransitionForScene,
  getTransitionsInOrder,
  getTotalTransitionTime,
  generateFfmpegTransitionFilter,
  validateTransitions,
} from '../../src/demo/scene-transitions';
import { DEMO_SCENES } from '../../src/demo/scene-definitions';

describe('Scene Transitions', () => {
  describe('SCENE_TRANSITIONS', () => {
    it('should have 7 transitions matching 7 scenes', () => {
      expect(SCENE_TRANSITIONS).toHaveLength(7);
    });

    it('should have a transition for each scene', () => {
      for (const scene of DEMO_SCENES) {
        const transition = SCENE_TRANSITIONS.find(t => t.to_scene_id === scene.id);
        expect(transition).toBeDefined();
      }
    });

    it('should have first scene fading in from black', () => {
      const first = SCENE_TRANSITIONS.find(t => t.to_scene_order === 1);
      expect(first).toBeDefined();
      expect(first!.from_black).toBe(true);
      expect(first!.type).toBe('fade');
    });

    it('should have last scene fading out to black', () => {
      const last = SCENE_TRANSITIONS.find(t => t.to_scene_order === 7);
      expect(last).toBeDefined();
      expect(last!.to_black).toBe(true);
    });

    it('should have all durations between 500ms and 1500ms', () => {
      for (const t of SCENE_TRANSITIONS) {
        expect(t.duration_ms).toBeGreaterThanOrEqual(500);
        expect(t.duration_ms).toBeLessThanOrEqual(1500);
      }
    });

    it('should use valid transition types', () => {
      const validTypes: TransitionType[] = ['fade', 'slide-left', 'slide-up', 'zoom', 'none'];
      for (const t of SCENE_TRANSITIONS) {
        expect(validTypes).toContain(t.type);
      }
    });

    it('should have valid easing functions', () => {
      const validEasings = ['ease-in-out', 'ease-in', 'ease-out', 'linear'];
      for (const t of SCENE_TRANSITIONS) {
        expect(validEasings).toContain(t.easing);
      }
    });

    it('should have continuous scene order from 1 to 7', () => {
      const orders = SCENE_TRANSITIONS.map(t => t.to_scene_order).sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('getTransitionForScene', () => {
    it('should return transition for valid scene ID', () => {
      const transition = getTransitionForScene('marketplace-overview');
      expect(transition).toBeDefined();
      expect(transition!.to_scene_id).toBe('marketplace-overview');
    });

    it('should return transition for each defined scene', () => {
      for (const scene of DEMO_SCENES) {
        const transition = getTransitionForScene(scene.id);
        expect(transition).toBeDefined();
      }
    });

    it('should return undefined for unknown scene ID', () => {
      const transition = getTransitionForScene('nonexistent');
      expect(transition).toBeUndefined();
    });
  });

  describe('getTransitionsInOrder', () => {
    it('should return transitions sorted by scene order', () => {
      const ordered = getTransitionsInOrder();
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].to_scene_order).toBeGreaterThan(ordered[i - 1].to_scene_order);
      }
    });

    it('should return a copy (not the original array)', () => {
      const ordered1 = getTransitionsInOrder();
      const ordered2 = getTransitionsInOrder();
      expect(ordered1).toEqual(ordered2);
      expect(ordered1).not.toBe(ordered2);
    });

    it('should have 7 transitions', () => {
      expect(getTransitionsInOrder()).toHaveLength(7);
    });
  });

  describe('getTotalTransitionTime', () => {
    it('should return sum of all transition durations', () => {
      const total = getTotalTransitionTime();
      const expected = SCENE_TRANSITIONS.reduce((sum, t) => sum + t.duration_ms, 0);
      expect(total).toBe(expected);
    });

    it('should be greater than 0', () => {
      expect(getTotalTransitionTime()).toBeGreaterThan(0);
    });

    it('should be reasonable (under 15 seconds total)', () => {
      expect(getTotalTransitionTime()).toBeLessThan(15000);
    });
  });

  describe('generateFfmpegTransitionFilter', () => {
    it('should generate fade-in filter for from_black scene', () => {
      const transition: SceneTransition = {
        to_scene_id: 'test',
        to_scene_order: 1,
        type: 'fade',
        duration_ms: 1000,
        easing: 'ease-in',
        from_black: true,
        to_black: false,
      };
      const filter = generateFfmpegTransitionFilter(transition, 0);
      expect(filter).toContain('fade=t=in');
      expect(filter).toContain('[v0]');
    });

    it('should generate fade-out filter for to_black scene', () => {
      const transition: SceneTransition = {
        to_scene_id: 'test',
        to_scene_order: 7,
        type: 'fade',
        duration_ms: 1200,
        easing: 'ease-out',
        from_black: false,
        to_black: true,
      };
      const filter = generateFfmpegTransitionFilter(transition, 6);
      expect(filter).toContain('fade=t=out');
      expect(filter).toContain('[v6]');
    });

    it('should generate zoom filter', () => {
      const transition: SceneTransition = {
        to_scene_id: 'test',
        to_scene_order: 4,
        type: 'zoom',
        duration_ms: 900,
        easing: 'ease-out',
        from_black: false,
        to_black: false,
      };
      const filter = generateFfmpegTransitionFilter(transition, 3);
      expect(filter).toContain('zoompan');
      expect(filter).toContain('[v3]');
    });

    it('should generate null filter for none type', () => {
      const transition: SceneTransition = {
        to_scene_id: 'test',
        to_scene_order: 1,
        type: 'none',
        duration_ms: 0,
        easing: 'linear',
        from_black: false,
        to_black: false,
      };
      const filter = generateFfmpegTransitionFilter(transition, 0);
      expect(filter).toContain('null');
    });
  });

  describe('validateTransitions', () => {
    it('should validate successfully with default transitions', () => {
      const result = validateTransitions();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors array even when valid', () => {
      const result = validateTransitions();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
