import { VideoRecorder, VideoManifest, VideoFrame } from '../../src/demo/video-recorder';

describe('VideoRecorder', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const recorder = new VideoRecorder();
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.outputDir).toBe('./demo-frames');
      expect(config.captureScreenshots).toBe(false);
      expect(config.frameDuration).toBe(5000);
    });

    it('should accept custom config', () => {
      const recorder = new VideoRecorder({
        baseUrl: 'http://test:8080',
        outputDir: '/tmp/frames',
        captureScreenshots: false,
        frameDuration: 3000,
      });
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://test:8080');
      expect(config.outputDir).toBe('/tmp/frames');
      expect(config.frameDuration).toBe(3000);
    });

    it('should merge partial config with defaults', () => {
      const recorder = new VideoRecorder({ frameDuration: 2000 });
      const config = recorder.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.frameDuration).toBe(2000);
    });
  });

  describe('getFrames', () => {
    it('should return empty array before recording', () => {
      const recorder = new VideoRecorder();
      expect(recorder.getFrames()).toEqual([]);
    });

    it('should return a copy of frames array', () => {
      const recorder = new VideoRecorder();
      const frames1 = recorder.getFrames();
      const frames2 = recorder.getFrames();
      expect(frames1).toEqual(frames2);
      expect(frames1).not.toBe(frames2);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const recorder = new VideoRecorder();
      const config1 = recorder.getConfig();
      const config2 = recorder.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('VideoFrame type validation', () => {
    it('should have correct frame structure', () => {
      const frame: VideoFrame = {
        index: 0,
        title: 'Test Frame',
        description: 'A test frame',
        url: 'http://localhost:3000/',
        timestamp: new Date().toISOString(),
        duration_ms: 5000,
        annotations: ['Test', 'Demo'],
      };
      expect(frame.index).toBe(0);
      expect(frame.title).toBe('Test Frame');
      expect(frame.annotations.length).toBe(2);
    });

    it('should support optional screenshot path', () => {
      const frame: VideoFrame = {
        index: 0,
        title: 'Test',
        description: 'Test',
        url: 'http://test',
        timestamp: new Date().toISOString(),
        duration_ms: 5000,
        annotations: [],
        screenshotPath: '/tmp/frame-000.png',
      };
      expect(frame.screenshotPath).toBe('/tmp/frame-000.png');
    });
  });

  describe('VideoManifest type validation', () => {
    it('should have correct manifest structure', () => {
      const manifest: VideoManifest = {
        title: 'Test Video',
        version: '0.14.0',
        recorded_at: new Date().toISOString(),
        base_url: 'http://localhost:3000',
        output_dir: './demo-frames',
        total_frames: 0,
        total_duration_ms: 0,
        frames: [],
        demo_summary: {
          agents_shown: 8,
          skills_published: 14,
          hires_completed: 1,
          points_awarded: 150,
          standards_demonstrated: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
        },
      };
      expect(manifest.version).toBe('0.14.0');
      expect(manifest.demo_summary.standards_demonstrated.length).toBe(6);
      expect(manifest.demo_summary.agents_shown).toBe(8);
    });
  });
});
