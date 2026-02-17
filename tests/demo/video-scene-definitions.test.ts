/**
 * Tests for Video Scene Definitions — the 7 demo scenes for Apex video.
 */

import {
  VIDEO_SCENES,
  VideoScene,
  getVideoTotalDuration,
  getVideoAllStandards,
  getVideoScenesInOrder,
} from '../../src/demo/video-scene-definitions';

describe('Video Scene Definitions', () => {
  describe('VIDEO_SCENES array', () => {
    it('should have exactly 7 scenes', () => {
      expect(VIDEO_SCENES).toHaveLength(7);
    });

    it('should have scenes ordered 1-7', () => {
      const orders = VIDEO_SCENES.map(s => s.order);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should have unique scene IDs', () => {
      const ids = VIDEO_SCENES.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have the correct 7 scene IDs from the task spec', () => {
      const ids = VIDEO_SCENES.map(s => s.id);
      expect(ids).toContain('dashboard-overview');
      expect(ids).toContain('agent-registry');
      expect(ids).toContain('agent-detail');
      expect(ids).toContain('hire-agent');
      expect(ids).toContain('activity-feed');
      expect(ids).toContain('hol-registry');
      expect(ids).toContain('register-agent');
    });
  });

  describe('scene structure', () => {
    it.each(VIDEO_SCENES.map(s => [s.id, s]))(
      'scene %s should have all required fields',
      (_id, scene) => {
        const s = scene as VideoScene;
        expect(s.id).toBeTruthy();
        expect(s.order).toBeGreaterThan(0);
        expect(s.title).toBeTruthy();
        expect(s.overlayTitle).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(s.duration_s).toBeGreaterThan(0);
        expect(s.hcs_standards.length).toBeGreaterThan(0);
        expect(s.overlays.length).toBeGreaterThan(0);
        expect(s.actions.length).toBeGreaterThan(0);
        expect(s.narration).toBeTruthy();
      },
    );

    it('every scene should demonstrate at least one HCS standard', () => {
      for (const scene of VIDEO_SCENES) {
        expect(scene.hcs_standards.length).toBeGreaterThanOrEqual(1);
        for (const std of scene.hcs_standards) {
          expect(std).toMatch(/^HCS-\d+$/);
        }
      }
    });

    it('every scene should have a positive duration in seconds', () => {
      for (const scene of VIDEO_SCENES) {
        expect(scene.duration_s).toBeGreaterThanOrEqual(5);
        expect(scene.duration_s).toBeLessThanOrEqual(30);
      }
    });
  });

  describe('overlay structure', () => {
    const validPositions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'center'];
    const validStyles = ['title', 'subtitle', 'badge', 'caption'];

    it('should have valid overlay positions', () => {
      for (const scene of VIDEO_SCENES) {
        for (const overlay of scene.overlays) {
          expect(validPositions).toContain(overlay.position);
        }
      }
    });

    it('should have valid overlay styles', () => {
      for (const scene of VIDEO_SCENES) {
        for (const overlay of scene.overlays) {
          expect(validStyles).toContain(overlay.style);
        }
      }
    });

    it('every scene should have a title overlay', () => {
      for (const scene of VIDEO_SCENES) {
        const hasTitle = scene.overlays.some(o => o.style === 'title');
        expect(hasTitle).toBe(true);
      }
    });

    it('every scene should have a subtitle overlay', () => {
      for (const scene of VIDEO_SCENES) {
        const hasSub = scene.overlays.some(o => o.style === 'subtitle');
        expect(hasSub).toBe(true);
      }
    });

    it('every scene should have a badge overlay', () => {
      for (const scene of VIDEO_SCENES) {
        const hasBadge = scene.overlays.some(o => o.style === 'badge');
        expect(hasBadge).toBe(true);
      }
    });
  });

  describe('action structure', () => {
    const validActionTypes = ['navigate', 'click', 'type', 'wait', 'scroll', 'api-call'];

    it('should have valid action types', () => {
      for (const scene of VIDEO_SCENES) {
        for (const action of scene.actions) {
          expect(validActionTypes).toContain(action.type);
        }
      }
    });

    it('every scene should have at least one navigate action', () => {
      for (const scene of VIDEO_SCENES) {
        const hasNav = scene.actions.some(a => a.type === 'navigate');
        expect(hasNav).toBe(true);
      }
    });

    it('navigate actions should have a target', () => {
      for (const scene of VIDEO_SCENES) {
        const navActions = scene.actions.filter(a => a.type === 'navigate');
        for (const action of navActions) {
          expect(action.target).toBeTruthy();
        }
      }
    });
  });

  describe('specific scene content', () => {
    it('scene 1 should be dashboard overview with all 6 standards', () => {
      const scene = VIDEO_SCENES[0];
      expect(scene.id).toBe('dashboard-overview');
      expect(scene.hcs_standards).toHaveLength(6);
    });

    it('scene 2 should be agent registry with HCS-26 skills', () => {
      const scene = VIDEO_SCENES[1];
      expect(scene.id).toBe('agent-registry');
      expect(scene.hcs_standards).toContain('HCS-26');
    });

    it('scene 3 should be agent detail with HCS-19 privacy', () => {
      const scene = VIDEO_SCENES[2];
      expect(scene.id).toBe('agent-detail');
      expect(scene.hcs_standards).toContain('HCS-19');
    });

    it('scene 4 should be hire agent with HCS-10 and HCS-14', () => {
      const scene = VIDEO_SCENES[3];
      expect(scene.id).toBe('hire-agent');
      expect(scene.hcs_standards).toContain('HCS-10');
      expect(scene.hcs_standards).toContain('HCS-14');
    });

    it('scene 5 should be activity feed with HCS-10', () => {
      const scene = VIDEO_SCENES[4];
      expect(scene.id).toBe('activity-feed');
      expect(scene.hcs_standards).toContain('HCS-10');
    });

    it('scene 6 should be HOL registry', () => {
      const scene = VIDEO_SCENES[5];
      expect(scene.id).toBe('hol-registry');
    });

    it('scene 7 should be register agent with HCS-10/11/14/19', () => {
      const scene = VIDEO_SCENES[6];
      expect(scene.id).toBe('register-agent');
      expect(scene.hcs_standards).toContain('HCS-10');
      expect(scene.hcs_standards).toContain('HCS-11');
      expect(scene.hcs_standards).toContain('HCS-14');
      expect(scene.hcs_standards).toContain('HCS-19');
    });
  });

  describe('getVideoScenesInOrder', () => {
    it('should return scenes sorted by order', () => {
      const scenes = getVideoScenesInOrder();
      for (let i = 1; i < scenes.length; i++) {
        expect(scenes[i].order).toBeGreaterThan(scenes[i - 1].order);
      }
    });

    it('should return a copy (not the original array)', () => {
      const scenes1 = getVideoScenesInOrder();
      const scenes2 = getVideoScenesInOrder();
      expect(scenes1).toEqual(scenes2);
      expect(scenes1).not.toBe(scenes2);
    });

    it('should have 7 scenes', () => {
      expect(getVideoScenesInOrder()).toHaveLength(7);
    });
  });

  describe('getVideoAllStandards', () => {
    it('should return all 6 HCS standards', () => {
      const standards = getVideoAllStandards();
      expect(standards).toHaveLength(6);
      expect(standards).toContain('HCS-10');
      expect(standards).toContain('HCS-11');
      expect(standards).toContain('HCS-14');
      expect(standards).toContain('HCS-19');
      expect(standards).toContain('HCS-20');
      expect(standards).toContain('HCS-26');
    });

    it('should return sorted standards', () => {
      const standards = getVideoAllStandards();
      const sorted = [...standards].sort();
      expect(standards).toEqual(sorted);
    });

    it('should have no duplicates', () => {
      const standards = getVideoAllStandards();
      const unique = new Set(standards);
      expect(unique.size).toBe(standards.length);
    });
  });

  describe('getVideoTotalDuration', () => {
    it('should return sum of all scene durations in seconds', () => {
      const expected = VIDEO_SCENES.reduce((sum, s) => sum + s.duration_s, 0);
      expect(getVideoTotalDuration()).toBe(expected);
    });

    it('should be between 30s and 120s (target ~60s)', () => {
      const duration = getVideoTotalDuration();
      expect(duration).toBeGreaterThanOrEqual(30);
      expect(duration).toBeLessThanOrEqual(120);
    });
  });
});
