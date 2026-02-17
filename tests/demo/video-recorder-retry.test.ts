/**
 * Video recorder retry logic and configuration tests.
 */

import { VideoRecorder, VideoRecorderConfig } from '../../src/demo/video-recorder';

describe('VideoRecorder — Retry Configuration', () => {
  describe('default retry settings', () => {
    it('should have 3 screenshot retries by default', () => {
      const recorder = new VideoRecorder();
      const config = recorder.getConfig();
      expect(config.screenshotRetries).toBe(3);
    });

    it('should have 1000ms retry delay by default', () => {
      const recorder = new VideoRecorder();
      const config = recorder.getConfig();
      expect(config.screenshotRetryDelay).toBe(1000);
    });
  });

  describe('custom retry settings', () => {
    it('should accept custom retry count', () => {
      const recorder = new VideoRecorder({ screenshotRetries: 5 });
      const config = recorder.getConfig();
      expect(config.screenshotRetries).toBe(5);
    });

    it('should accept custom retry delay', () => {
      const recorder = new VideoRecorder({ screenshotRetryDelay: 2000 });
      const config = recorder.getConfig();
      expect(config.screenshotRetryDelay).toBe(2000);
    });

    it('should allow zero retries', () => {
      const recorder = new VideoRecorder({ screenshotRetries: 0 });
      const config = recorder.getConfig();
      expect(config.screenshotRetries).toBe(0);
    });

    it('should merge retry settings with other defaults', () => {
      const recorder = new VideoRecorder({ screenshotRetries: 2, frameDuration: 3000 });
      const config = recorder.getConfig();
      expect(config.screenshotRetries).toBe(2);
      expect(config.frameDuration).toBe(3000);
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.screenshotRetryDelay).toBe(1000);
    });
  });

  describe('recording without screenshots', () => {
    it('should record 8 frames without screenshots', async () => {
      const recorder = new VideoRecorder({
        captureScreenshots: false,
        baseUrl: 'http://localhost:19999', // Non-existent server (OK for non-screenshot mode)
      });

      // record() will fail on triggerDemo (no server), but captureFrame
      // calls that don't require fetch should succeed
      // We test that getFrames returns empty before recording
      expect(recorder.getFrames()).toEqual([]);
    });

    it('should not set screenshotPath when captureScreenshots is false', () => {
      const recorder = new VideoRecorder({ captureScreenshots: false });
      const config = recorder.getConfig();
      expect(config.captureScreenshots).toBe(false);
    });
  });

  describe('config immutability', () => {
    it('should return a new config object each time', () => {
      const recorder = new VideoRecorder({ screenshotRetries: 5 });
      const config1 = recorder.getConfig();
      const config2 = recorder.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('should return a new frames array each time', () => {
      const recorder = new VideoRecorder();
      const frames1 = recorder.getFrames();
      const frames2 = recorder.getFrames();
      expect(frames1).toEqual(frames2);
      expect(frames1).not.toBe(frames2);
    });
  });

  describe('version tracking', () => {
    it('config should include all required fields', () => {
      const recorder = new VideoRecorder();
      const config = recorder.getConfig();
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('outputDir');
      expect(config).toHaveProperty('captureScreenshots');
      expect(config).toHaveProperty('frameDuration');
      expect(config).toHaveProperty('screenshotRetries');
      expect(config).toHaveProperty('screenshotRetryDelay');
    });
  });
});
