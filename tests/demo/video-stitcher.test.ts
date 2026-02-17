/**
 * Tests for Video Stitcher module.
 *
 * Tests the VideoStitcher class and the screenshot slideshow command generator.
 */

import { VideoStitcher, StitcherConfig, StitchResult, generateScreenshotSlideshowCommand } from '../../src/demo/video-stitcher';
import { VIDEO_SCENES, getVideoScenesInOrder, getVideoTotalDuration } from '../../src/demo/video-scene-definitions';

describe('VideoStitcher', () => {
  describe('constructor and config', () => {
    it('should create instance with default config', () => {
      const stitcher = new VideoStitcher();
      const config = stitcher.getConfig();
      expect(config.inputDir).toBe('./demo-video');
      expect(config.outputPath).toBe('./demo-video/hedera-apex-demo.mp4');
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.fps).toBe(30);
      expect(config.titleDuration).toBe(3);
      expect(config.endDuration).toBe(3);
      expect(config.crossfadeDuration).toBe(0.5);
      expect(config.maxSizeMB).toBe(50);
    });

    it('should merge custom config with defaults', () => {
      const stitcher = new VideoStitcher({
        inputDir: '/tmp/scenes',
        outputPath: '/tmp/output.mp4',
        crossfadeDuration: 1.0,
      });
      const config = stitcher.getConfig();
      expect(config.inputDir).toBe('/tmp/scenes');
      expect(config.outputPath).toBe('/tmp/output.mp4');
      expect(config.crossfadeDuration).toBe(1.0);
      // Defaults preserved
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
    });

    it('should return a copy of config', () => {
      const stitcher = new VideoStitcher();
      const config1 = stitcher.getConfig();
      const config2 = stitcher.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should respect title card duration of 3s', () => {
      const stitcher = new VideoStitcher();
      expect(stitcher.getConfig().titleDuration).toBe(3);
    });

    it('should respect end card duration of 3s', () => {
      const stitcher = new VideoStitcher();
      expect(stitcher.getConfig().endDuration).toBe(3);
    });

    it('should respect crossfade duration of 0.5s', () => {
      const stitcher = new VideoStitcher();
      expect(stitcher.getConfig().crossfadeDuration).toBe(0.5);
    });

    it('should have max size of 50MB', () => {
      const stitcher = new VideoStitcher();
      expect(stitcher.getConfig().maxSizeMB).toBe(50);
    });
  });

  describe('StitchResult interface', () => {
    it('should have all required fields for success', () => {
      const result: StitchResult = {
        outputPath: './demo-video/hedera-apex-demo.mp4',
        duration_s: 66,
        fileSize_bytes: 10 * 1024 * 1024,
        fileSize_mb: 10,
        success: true,
        scenesIncluded: 7,
      };
      expect(result.success).toBe(true);
      expect(result.scenesIncluded).toBe(7);
      expect(result.outputPath).toContain('.mp4');
    });

    it('should have error field for failure', () => {
      const result: StitchResult = {
        outputPath: './demo-video/hedera-apex-demo.mp4',
        duration_s: 0,
        fileSize_bytes: 0,
        fileSize_mb: 0,
        success: false,
        scenesIncluded: 0,
        error: 'No scene clips found',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('No scene clips found');
    });
  });

  describe('estimated video duration', () => {
    it('total video should be under 120s (2 minutes)', () => {
      const totalSceneDuration = getVideoTotalDuration();
      const titleEnd = 3 + 3; // title + end cards
      const total = totalSceneDuration + titleEnd;
      expect(total).toBeLessThanOrEqual(120);
    });

    it('total video should be at least 30s', () => {
      const totalSceneDuration = getVideoTotalDuration();
      const titleEnd = 3 + 3;
      const total = totalSceneDuration + titleEnd;
      expect(total).toBeGreaterThanOrEqual(30);
    });
  });
});

describe('generateScreenshotSlideshowCommand', () => {
  it('should generate a valid ffmpeg command string', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './demo-video/slideshow.mp4', durations);
    expect(cmd).toContain('ffmpeg');
    expect(cmd).toContain('-filter_complex');
    expect(cmd).toContain('slideshow.mp4');
  });

  it('should include all scene screenshot inputs', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './output.mp4', durations);
    // Should have inputs for all 7 scenes
    for (const scene of VIDEO_SCENES) {
      const expectedName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.png`;
      expect(cmd).toContain(expectedName);
    }
  });

  it('should use crossfade transition', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './output.mp4', durations);
    expect(cmd).toContain('xfade=transition=fade');
  });

  it('should use H.264 codec', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './output.mp4', durations);
    expect(cmd).toContain('libx264');
  });

  it('should accept custom resolution', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './output.mp4', durations, {
      width: 1280,
      height: 720,
      fps: 30,
      crossfadeDuration: 0.5,
    });
    expect(cmd).toContain('1280');
    expect(cmd).toContain('720');
  });

  it('should respect custom crossfade duration', () => {
    const durations = VIDEO_SCENES.map(s => s.duration_s);
    const cmd = generateScreenshotSlideshowCommand('./demo-video', './output.mp4', durations, {
      width: 1920,
      height: 1080,
      fps: 30,
      crossfadeDuration: 1.0,
    });
    expect(cmd).toContain('duration=1');
  });
});
