/**
 * Tests for demo scene definitions.
 */

import {
  DEMO_SCENES,
  DemoScene,
  TextOverlay,
  SceneAction,
  getScenesInOrder,
  getAllStandards,
  getTotalDuration,
  getSceneById,
} from '../../src/demo/scene-definitions';

describe('Scene Definitions', () => {
  describe('DEMO_SCENES array', () => {
    it('should have exactly 7 scenes', () => {
      expect(DEMO_SCENES).toHaveLength(7);
    });

    it('should have scenes ordered 1-7', () => {
      const orders = DEMO_SCENES.map(s => s.order);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should have unique scene IDs', () => {
      const ids = DEMO_SCENES.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique screenshot names', () => {
      const names = DEMO_SCENES.map(s => s.screenshot_name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('scene structure', () => {
    it.each(DEMO_SCENES.map(s => [s.id, s]))(
      'scene %s should have all required fields',
      (_id, scene) => {
        const s = scene as DemoScene;
        expect(s.id).toBeTruthy();
        expect(s.order).toBeGreaterThan(0);
        expect(s.title).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.duration_ms).toBeGreaterThan(0);
        expect(s.hcs_standards.length).toBeGreaterThan(0);
        expect(s.overlays.length).toBeGreaterThan(0);
        expect(s.actions.length).toBeGreaterThan(0);
        expect(s.screenshot_name).toBeTruthy();
        expect(s.narration).toBeTruthy();
      },
    );

    it('every scene should demonstrate at least one HCS standard', () => {
      for (const scene of DEMO_SCENES) {
        expect(scene.hcs_standards.length).toBeGreaterThanOrEqual(1);
        for (const std of scene.hcs_standards) {
          expect(std).toMatch(/^HCS-\d+$/);
        }
      }
    });

    it('every scene should have a positive duration', () => {
      for (const scene of DEMO_SCENES) {
        expect(scene.duration_ms).toBeGreaterThanOrEqual(10000);
      }
    });
  });

  describe('overlay structure', () => {
    const validPositions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'center'];
    const validStyles = ['title', 'subtitle', 'badge', 'caption'];

    it('should have valid overlay positions', () => {
      for (const scene of DEMO_SCENES) {
        for (const overlay of scene.overlays) {
          expect(validPositions).toContain(overlay.position);
        }
      }
    });

    it('should have valid overlay styles', () => {
      for (const scene of DEMO_SCENES) {
        for (const overlay of scene.overlays) {
          expect(validStyles).toContain(overlay.style);
        }
      }
    });

    it('every scene should have a title overlay', () => {
      for (const scene of DEMO_SCENES) {
        const hasTitle = scene.overlays.some(o => o.style === 'title');
        expect(hasTitle).toBe(true);
      }
    });
  });

  describe('action structure', () => {
    const validActionTypes = ['navigate', 'click', 'type', 'wait', 'scroll', 'api-call'];

    it('should have valid action types', () => {
      for (const scene of DEMO_SCENES) {
        for (const action of scene.actions) {
          expect(validActionTypes).toContain(action.type);
        }
      }
    });

    it('every scene should have at least one navigate action', () => {
      for (const scene of DEMO_SCENES) {
        const hasNav = scene.actions.some(a => a.type === 'navigate');
        expect(hasNav).toBe(true);
      }
    });

    it('navigate actions should have a target', () => {
      for (const scene of DEMO_SCENES) {
        const navActions = scene.actions.filter(a => a.type === 'navigate');
        for (const action of navActions) {
          expect(action.target).toBeTruthy();
        }
      }
    });
  });

  describe('specific scene content', () => {
    it('scene 1 should be marketplace overview with all 6 standards', () => {
      const scene = DEMO_SCENES[0];
      expect(scene.id).toBe('marketplace-overview');
      expect(scene.hcs_standards).toHaveLength(6);
    });

    it('scene 2 should seed agents with HCS-10/11/14/19', () => {
      const scene = DEMO_SCENES[1];
      expect(scene.id).toBe('seed-agents');
      expect(scene.hcs_standards).toContain('HCS-10');
      expect(scene.hcs_standards).toContain('HCS-11');
      expect(scene.hcs_standards).toContain('HCS-14');
      expect(scene.hcs_standards).toContain('HCS-19');
    });

    it('scene 3 should browse marketplace with HCS-26', () => {
      const scene = DEMO_SCENES[2];
      expect(scene.id).toBe('browse-marketplace');
      expect(scene.hcs_standards).toContain('HCS-26');
    });

    it('scene 7 should show rating and HCS-20 points', () => {
      const scene = DEMO_SCENES[6];
      expect(scene.id).toBe('rating-points');
      expect(scene.hcs_standards).toContain('HCS-20');
    });
  });

  describe('getScenesInOrder', () => {
    it('should return scenes sorted by order', () => {
      const scenes = getScenesInOrder();
      for (let i = 1; i < scenes.length; i++) {
        expect(scenes[i].order).toBeGreaterThan(scenes[i - 1].order);
      }
    });

    it('should return a copy (not the original array)', () => {
      const scenes1 = getScenesInOrder();
      const scenes2 = getScenesInOrder();
      expect(scenes1).toEqual(scenes2);
      expect(scenes1).not.toBe(scenes2);
    });
  });

  describe('getAllStandards', () => {
    it('should return all 6 HCS standards', () => {
      const standards = getAllStandards();
      expect(standards).toHaveLength(6);
      expect(standards).toContain('HCS-10');
      expect(standards).toContain('HCS-11');
      expect(standards).toContain('HCS-14');
      expect(standards).toContain('HCS-19');
      expect(standards).toContain('HCS-20');
      expect(standards).toContain('HCS-26');
    });

    it('should return sorted standards', () => {
      const standards = getAllStandards();
      const sorted = [...standards].sort();
      expect(standards).toEqual(sorted);
    });

    it('should have no duplicates', () => {
      const standards = getAllStandards();
      const unique = new Set(standards);
      expect(unique.size).toBe(standards.length);
    });
  });

  describe('getTotalDuration', () => {
    it('should return sum of all scene durations', () => {
      const expected = DEMO_SCENES.reduce((sum, s) => sum + s.duration_ms, 0);
      expect(getTotalDuration()).toBe(expected);
    });

    it('should be between 2 and 5 minutes (target 3-4 min)', () => {
      const durationSec = getTotalDuration() / 1000;
      expect(durationSec).toBeGreaterThanOrEqual(120); // 2 min
      expect(durationSec).toBeLessThanOrEqual(300); // 5 min
    });
  });

  describe('getSceneById', () => {
    it('should find scene by valid ID', () => {
      const scene = getSceneById('marketplace-overview');
      expect(scene).toBeDefined();
      expect(scene!.title).toBe('Marketplace Overview');
    });

    it('should return undefined for invalid ID', () => {
      const scene = getSceneById('nonexistent');
      expect(scene).toBeUndefined();
    });

    it('should find all scenes by their IDs', () => {
      for (const scene of DEMO_SCENES) {
        const found = getSceneById(scene.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(scene.id);
      }
    });
  });
});
