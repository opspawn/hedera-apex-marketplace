/**
 * Tests for DemoSceneRecorder.
 */

import {
  DemoSceneRecorder,
  DemoSceneRecorderConfig,
  SceneRecording,
  RecordingManifest,
} from '../../src/demo/demo-scene-recorder';

describe('DemoSceneRecorder', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const recorder = new DemoSceneRecorder();
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.outputDir).toBe('./demo-video');
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.fps).toBe(30);
      expect(config.captureScreenshots).toBe(false);
      expect(config.headless).toBe(true);
    });

    it('should accept custom config', () => {
      const recorder = new DemoSceneRecorder({
        baseUrl: 'http://test:8080',
        outputDir: '/tmp/video',
        width: 1280,
        height: 720,
        fps: 24,
      });
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://test:8080');
      expect(config.outputDir).toBe('/tmp/video');
      expect(config.width).toBe(1280);
      expect(config.height).toBe(720);
      expect(config.fps).toBe(24);
    });

    it('should merge partial config with defaults', () => {
      const recorder = new DemoSceneRecorder({ fps: 60 });
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.fps).toBe(60);
      expect(config.width).toBe(1920);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const recorder = new DemoSceneRecorder();
      const config1 = recorder.getConfig();
      const config2 = recorder.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should include all required config fields', () => {
      const recorder = new DemoSceneRecorder();
      const config = recorder.getConfig();
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('outputDir');
      expect(config).toHaveProperty('width');
      expect(config).toHaveProperty('height');
      expect(config).toHaveProperty('fps');
      expect(config).toHaveProperty('captureScreenshots');
      expect(config).toHaveProperty('headless');
      expect(config).toHaveProperty('screenshotRetries');
      expect(config).toHaveProperty('screenshotRetryDelay');
      expect(config).toHaveProperty('navigationTimeout');
    });
  });

  describe('getRecordings', () => {
    it('should return empty array before recording', () => {
      const recorder = new DemoSceneRecorder();
      expect(recorder.getRecordings()).toEqual([]);
    });

    it('should return a copy of recordings array', () => {
      const recorder = new DemoSceneRecorder();
      const recordings1 = recorder.getRecordings();
      const recordings2 = recorder.getRecordings();
      expect(recordings1).toEqual(recordings2);
      expect(recordings1).not.toBe(recordings2);
    });
  });

  describe('retry configuration', () => {
    it('should have 3 screenshot retries by default', () => {
      const recorder = new DemoSceneRecorder();
      expect(recorder.getConfig().screenshotRetries).toBe(3);
    });

    it('should have 1000ms retry delay by default', () => {
      const recorder = new DemoSceneRecorder();
      expect(recorder.getConfig().screenshotRetryDelay).toBe(1000);
    });

    it('should accept custom retry settings', () => {
      const recorder = new DemoSceneRecorder({
        screenshotRetries: 5,
        screenshotRetryDelay: 2000,
      });
      const config = recorder.getConfig();
      expect(config.screenshotRetries).toBe(5);
      expect(config.screenshotRetryDelay).toBe(2000);
    });
  });

  describe('resolution settings', () => {
    it('should default to 1920x1080 (Full HD)', () => {
      const recorder = new DemoSceneRecorder();
      const config = recorder.getConfig();
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
    });

    it('should accept custom resolution', () => {
      const recorder = new DemoSceneRecorder({ width: 3840, height: 2160 });
      const config = recorder.getConfig();
      expect(config.width).toBe(3840);
      expect(config.height).toBe(2160);
    });
  });

  describe('navigation timeout', () => {
    it('should default to 15000ms', () => {
      const recorder = new DemoSceneRecorder();
      expect(recorder.getConfig().navigationTimeout).toBe(15000);
    });

    it('should accept custom timeout', () => {
      const recorder = new DemoSceneRecorder({ navigationTimeout: 30000 });
      expect(recorder.getConfig().navigationTimeout).toBe(30000);
    });
  });

  describe('SceneRecording type validation', () => {
    it('should have correct structure', () => {
      const recording: SceneRecording = {
        scene_id: 'test-scene',
        order: 1,
        title: 'Test Scene',
        description: 'A test scene',
        screenshot_path: null,
        duration_ms: 5000,
        hcs_standards: ['HCS-10', 'HCS-20'],
        narration: 'Test narration',
        captured_at: new Date().toISOString(),
        success: true,
      };
      expect(recording.scene_id).toBe('test-scene');
      expect(recording.hcs_standards).toHaveLength(2);
      expect(recording.success).toBe(true);
    });

    it('should support error field for failed recordings', () => {
      const recording: SceneRecording = {
        scene_id: 'failed-scene',
        order: 1,
        title: 'Failed',
        description: 'Failed scene',
        screenshot_path: null,
        duration_ms: 0,
        hcs_standards: [],
        narration: '',
        captured_at: new Date().toISOString(),
        success: false,
        error: 'Connection refused',
      };
      expect(recording.success).toBe(false);
      expect(recording.error).toBe('Connection refused');
    });
  });

  describe('RecordingManifest type validation', () => {
    it('should have correct structure', () => {
      const manifest: RecordingManifest = {
        title: 'Test Recording',
        version: '0.14.0',
        recorded_at: new Date().toISOString(),
        base_url: 'http://localhost:3000',
        output_dir: './demo-video',
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        total_scenes: 7,
        total_duration_ms: 190000,
        estimated_video_length_s: 190,
        scenes: [],
        standards_demonstrated: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
        summary: {
          scenes_captured: 7,
          scenes_failed: 0,
          total_screenshots: 7,
          standards_count: 6,
        },
      };
      expect(manifest.version).toBe('0.14.0');
      expect(manifest.resolution.width).toBe(1920);
      expect(manifest.resolution.height).toBe(1080);
      expect(manifest.fps).toBe(30);
      expect(manifest.standards_demonstrated).toHaveLength(6);
      expect(manifest.summary.standards_count).toBe(6);
    });
  });

  describe('metadata-only recording', () => {
    it('should record 7 scenes in metadata-only mode', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999', // No server needed for metadata-only
      });

      // In metadata-only mode, record() captures scene metadata without Playwright
      const manifest = await recorder.record();
      expect(manifest.total_scenes).toBe(7);
      expect(manifest.scenes).toHaveLength(7);
      expect(manifest.standards_demonstrated).toHaveLength(6);
      expect(manifest.version).toBe('0.14.0');
    }, 10000);

    it('should mark all scenes as successful in metadata-only mode', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999',
      });
      const manifest = await recorder.record();
      for (const scene of manifest.scenes) {
        expect(scene.success).toBe(true);
        expect(scene.screenshot_path).toBeNull();
      }
    }, 10000);

    it('should have correct scene order in manifest', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999',
      });
      const manifest = await recorder.record();
      for (let i = 0; i < manifest.scenes.length; i++) {
        expect(manifest.scenes[i].order).toBe(i + 1);
      }
    }, 10000);

    it('should include narration for each scene', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999',
      });
      const manifest = await recorder.record();
      for (const scene of manifest.scenes) {
        expect(scene.narration).toBeTruthy();
        expect(scene.narration.length).toBeGreaterThan(20);
      }
    }, 10000);

    it('should populate summary correctly', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999',
      });
      const manifest = await recorder.record();
      expect(manifest.summary.scenes_captured).toBe(7);
      expect(manifest.summary.scenes_failed).toBe(0);
      expect(manifest.summary.total_screenshots).toBe(0);
      expect(manifest.summary.standards_count).toBe(6);
    }, 10000);

    it('should have estimated video length in target range', async () => {
      const recorder = new DemoSceneRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999',
      });
      const manifest = await recorder.record();
      // Target: 3-4 minutes (180-240 seconds)
      expect(manifest.estimated_video_length_s).toBeGreaterThanOrEqual(120);
      expect(manifest.estimated_video_length_s).toBeLessThanOrEqual(300);
    }, 10000);
  });
});
