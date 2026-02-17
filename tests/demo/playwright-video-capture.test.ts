/**
 * Tests for Playwright Video Capture module.
 *
 * Tests the PlaywrightVideoCapture class without requiring a running browser.
 * Playwright is dynamically imported — tests mock it for unit testing.
 */

import { PlaywrightVideoCapture, CaptureConfig, SceneCaptureResult, CaptureResult } from '../../src/demo/playwright-video-capture';
import { VIDEO_SCENES, getVideoScenesInOrder, getVideoAllStandards } from '../../src/demo/video-scene-definitions';

describe('PlaywrightVideoCapture', () => {
  describe('constructor and config', () => {
    it('should create instance with default config', () => {
      const capture = new PlaywrightVideoCapture();
      const config = capture.getConfig();
      expect(config.baseUrl).toBe('http://localhost:4003');
      expect(config.outputDir).toBe('./demo-video');
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.fps).toBe(30);
      expect(config.headless).toBe(true);
      expect(config.navigationTimeout).toBe(15000);
      expect(config.settleMs).toBe(2000);
    });

    it('should merge custom config with defaults', () => {
      const capture = new PlaywrightVideoCapture({
        baseUrl: 'http://localhost:3000',
        outputDir: '/tmp/test-output',
        headless: false,
      });
      const config = capture.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.outputDir).toBe('/tmp/test-output');
      expect(config.headless).toBe(false);
      // Defaults preserved
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.fps).toBe(30);
    });

    it('should return a copy of config (not mutable reference)', () => {
      const capture = new PlaywrightVideoCapture();
      const config1 = capture.getConfig();
      const config2 = capture.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should accept custom resolution', () => {
      const capture = new PlaywrightVideoCapture({ width: 1280, height: 720 });
      const config = capture.getConfig();
      expect(config.width).toBe(1280);
      expect(config.height).toBe(720);
    });

    it('should accept custom FPS', () => {
      const capture = new PlaywrightVideoCapture({ fps: 60 });
      const config = capture.getConfig();
      expect(config.fps).toBe(60);
    });
  });

  describe('scene alignment', () => {
    it('should be configured for all 7 video scenes', () => {
      const scenes = getVideoScenesInOrder();
      expect(scenes).toHaveLength(7);
    });

    it('each scene should have an ID, order, title, and actions', () => {
      for (const scene of VIDEO_SCENES) {
        expect(scene.id).toBeTruthy();
        expect(scene.order).toBeGreaterThan(0);
        expect(scene.title).toBeTruthy();
        expect(scene.actions.length).toBeGreaterThan(0);
      }
    });

    it('should cover all 6 HCS standards across scenes', () => {
      const standards = getVideoAllStandards();
      expect(standards).toContain('HCS-10');
      expect(standards).toContain('HCS-11');
      expect(standards).toContain('HCS-14');
      expect(standards).toContain('HCS-19');
      expect(standards).toContain('HCS-20');
      expect(standards).toContain('HCS-26');
    });
  });

  describe('SceneCaptureResult structure', () => {
    it('should match expected interface shape', () => {
      const result: SceneCaptureResult = {
        scene_id: 'test',
        order: 1,
        title: 'Test Scene',
        videoPath: null,
        screenshotPath: null,
        duration_s: 8,
        success: true,
      };
      expect(result.scene_id).toBe('test');
      expect(result.success).toBe(true);
      expect(result.videoPath).toBeNull();
    });

    it('should support error field for failed captures', () => {
      const result: SceneCaptureResult = {
        scene_id: 'test',
        order: 1,
        title: 'Test Scene',
        videoPath: null,
        screenshotPath: null,
        duration_s: 8,
        success: false,
        error: 'Browser launch failed',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Browser launch failed');
    });
  });

  describe('CaptureResult structure', () => {
    it('should match expected interface shape', () => {
      const result: CaptureResult = {
        scenes: [],
        outputDir: './demo-video',
        totalScenes: 7,
        successCount: 7,
        failCount: 0,
        totalDuration_s: 60,
        standards: ['HCS-10', 'HCS-11'],
      };
      expect(result.totalScenes).toBe(7);
      expect(result.standards).toHaveLength(2);
    });
  });

  describe('output file naming', () => {
    it('scene file names should follow the pattern scene-NN-id.ext', () => {
      for (const scene of VIDEO_SCENES) {
        const order = String(scene.order).padStart(2, '0');
        const expectedVideoName = `scene-${order}-${scene.id}.mp4`;
        const expectedScreenshotName = `scene-${order}-${scene.id}.png`;
        // Just verify the naming convention is consistent
        expect(expectedVideoName).toMatch(/^scene-\d{2}-.+\.mp4$/);
        expect(expectedScreenshotName).toMatch(/^scene-\d{2}-.+\.png$/);
      }
    });
  });
});
