/**
 * Tests for Narration Script module.
 */

import {
  buildNarrationScript,
  getNarrationForScene,
  getNarrationAtTime,
  generatePlainTextScript,
  NarrationScript,
  NarrationSegment,
} from '../../src/demo/narration-script';
import { DEMO_SCENES, getTotalDuration } from '../../src/demo/scene-definitions';

describe('Narration Script', () => {
  describe('buildNarrationScript', () => {
    let script: NarrationScript;

    beforeEach(() => {
      script = buildNarrationScript();
    });

    it('should return a valid narration script', () => {
      expect(script).toBeDefined();
      expect(script.title).toContain('Hedera Agent Marketplace');
      expect(script.version).toBe('0.14.0');
    });

    it('should have 7 segments matching 7 scenes', () => {
      expect(script.segments).toHaveLength(7);
    });

    it('should have total duration matching scene definitions', () => {
      expect(script.total_duration_ms).toBe(getTotalDuration());
    });

    it('should format total duration correctly', () => {
      expect(script.total_duration_formatted).toMatch(/^\d+:\d{2}$/);
    });

    it('should include all segments in correct order', () => {
      for (let i = 0; i < script.segments.length; i++) {
        expect(script.segments[i].scene_order).toBe(i + 1);
      }
    });

    it('should have contiguous timestamps with no gaps', () => {
      for (let i = 1; i < script.segments.length; i++) {
        expect(script.segments[i].video_start_ms).toBe(script.segments[i - 1].video_end_ms);
      }
    });

    it('should have first segment starting at 0ms', () => {
      expect(script.segments[0].video_start_ms).toBe(0);
    });

    it('should have last segment ending at total duration', () => {
      const last = script.segments[script.segments.length - 1];
      expect(last.video_end_ms).toBe(getTotalDuration());
    });

    it('should calculate word count for each segment', () => {
      for (const seg of script.segments) {
        expect(seg.word_count).toBeGreaterThan(0);
      }
    });

    it('should estimate speaking duration based on 150 wpm', () => {
      for (const seg of script.segments) {
        expect(seg.estimated_speaking_ms).toBeGreaterThan(0);
        // 400ms per word (150 wpm = 60000/150 = 400ms)
        expect(seg.estimated_speaking_ms).toBe(Math.round(seg.word_count * 400));
      }
    });

    it('should validate if narration fits within scene duration', () => {
      for (const seg of script.segments) {
        expect(typeof seg.fits_duration).toBe('boolean');
        if (seg.fits_duration) {
          expect(seg.estimated_speaking_ms).toBeLessThanOrEqual(seg.duration_ms);
        }
      }
    });

    it('should extract key terms from narration', () => {
      for (const seg of script.segments) {
        expect(seg.key_terms.length).toBeGreaterThan(0);
      }
    });

    it('should include HCS standards for each segment', () => {
      for (const seg of script.segments) {
        expect(seg.hcs_standards.length).toBeGreaterThan(0);
      }
    });

    it('should have summary with correct totals', () => {
      expect(script.summary.total_segments).toBe(7);
      expect(script.summary.total_words).toBeGreaterThan(50);
      expect(script.summary.estimated_total_speaking_ms).toBeGreaterThan(0);
      expect(script.summary.standards_covered.length).toBe(6);
    });

    it('should cover all 6 HCS standards', () => {
      const standards = script.summary.standards_covered;
      expect(standards).toContain('HCS-10');
      expect(standards).toContain('HCS-11');
      expect(standards).toContain('HCS-14');
      expect(standards).toContain('HCS-19');
      expect(standards).toContain('HCS-20');
      expect(standards).toContain('HCS-26');
    });
  });

  describe('getNarrationForScene', () => {
    it('should return narration for valid scene ID', () => {
      const seg = getNarrationForScene('marketplace-overview');
      expect(seg).toBeDefined();
      expect(seg!.scene_id).toBe('marketplace-overview');
      expect(seg!.scene_order).toBe(1);
    });

    it('should return narration for each defined scene', () => {
      for (const scene of DEMO_SCENES) {
        const seg = getNarrationForScene(scene.id);
        expect(seg).toBeDefined();
        expect(seg!.narration).toBe(scene.narration);
      }
    });

    it('should return undefined for unknown scene ID', () => {
      const seg = getNarrationForScene('nonexistent-scene');
      expect(seg).toBeUndefined();
    });
  });

  describe('getNarrationAtTime', () => {
    it('should return first segment at time 0', () => {
      const seg = getNarrationAtTime(0);
      expect(seg).toBeDefined();
      expect(seg!.scene_order).toBe(1);
    });

    it('should return correct segment for mid-video timestamp', () => {
      const script = buildNarrationScript();
      const secondSegment = script.segments[1];
      const midTime = secondSegment.video_start_ms + 1000;
      const seg = getNarrationAtTime(midTime);
      expect(seg).toBeDefined();
      expect(seg!.scene_id).toBe(secondSegment.scene_id);
    });

    it('should return last segment near end of video', () => {
      const totalDuration = getTotalDuration();
      const seg = getNarrationAtTime(totalDuration - 1);
      expect(seg).toBeDefined();
      expect(seg!.scene_order).toBe(7);
    });

    it('should return undefined for time beyond video duration', () => {
      const totalDuration = getTotalDuration();
      const seg = getNarrationAtTime(totalDuration + 1000);
      expect(seg).toBeUndefined();
    });

    it('should return undefined for negative time', () => {
      const seg = getNarrationAtTime(-1);
      expect(seg).toBeUndefined();
    });
  });

  describe('generatePlainTextScript', () => {
    it('should generate non-empty text', () => {
      const text = generatePlainTextScript();
      expect(text.length).toBeGreaterThan(100);
    });

    it('should include title header', () => {
      const text = generatePlainTextScript();
      expect(text).toContain('Hedera Agent Marketplace');
    });

    it('should include all scene titles', () => {
      const text = generatePlainTextScript();
      for (const scene of DEMO_SCENES) {
        expect(text).toContain(scene.title);
      }
    });

    it('should include timestamps in M:SS format', () => {
      const text = generatePlainTextScript();
      expect(text).toMatch(/\d+:\d{2}/);
    });

    it('should include narration text for each scene', () => {
      const text = generatePlainTextScript();
      for (const scene of DEMO_SCENES) {
        expect(text).toContain(scene.narration);
      }
    });

    it('should include standards references', () => {
      const text = generatePlainTextScript();
      expect(text).toContain('HCS-10');
      expect(text).toContain('HCS-20');
    });
  });
});
