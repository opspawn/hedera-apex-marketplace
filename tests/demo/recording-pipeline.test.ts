/**
 * Tests for RecordingPipeline.
 */

import {
  RecordingPipeline,
  PipelineConfig,
  PipelineStatus,
} from '../../src/demo/recording-pipeline';

describe('RecordingPipeline', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const pipeline = new RecordingPipeline();
      const config = pipeline.getConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.outputDir).toBe('./demo-video');
      expect(config.captureScreenshots).toBe(false);
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
    });

    it('should accept custom config', () => {
      const pipeline = new RecordingPipeline({
        baseUrl: 'http://test:8080',
        outputDir: '/tmp/recording',
        captureScreenshots: true,
      });
      const config = pipeline.getConfig();
      expect(config.baseUrl).toBe('http://test:8080');
      expect(config.outputDir).toBe('/tmp/recording');
      expect(config.captureScreenshots).toBe(true);
    });

    it('should merge partial config with defaults', () => {
      const pipeline = new RecordingPipeline({ width: 1280 });
      const config = pipeline.getConfig();
      expect(config.width).toBe(1280);
      expect(config.height).toBe(1080);
      expect(config.baseUrl).toBe('http://localhost:3000');
    });
  });

  describe('getStatus', () => {
    it('should be idle initially', () => {
      const pipeline = new RecordingPipeline();
      expect(pipeline.getStatus()).toBe('idle');
    });
  });

  describe('getResult', () => {
    it('should be null initially', () => {
      const pipeline = new RecordingPipeline();
      expect(pipeline.getResult()).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const pipeline = new RecordingPipeline();
      const config1 = pipeline.getConfig();
      const config2 = pipeline.getConfig();
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('run', () => {
    it('should fail when server is not reachable', async () => {
      const pipeline = new RecordingPipeline({
        baseUrl: 'http://localhost:19999', // No server
      });

      const result = await pipeline.run();
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Server not reachable');
      expect(result.started_at).toBeDefined();
      expect(result.completed_at).toBeDefined();
    }, 15000);

    it('should set status to failed on error', async () => {
      const pipeline = new RecordingPipeline({
        baseUrl: 'http://localhost:19999',
      });

      await pipeline.run();
      expect(pipeline.getStatus()).toBe('failed');
    }, 15000);

    it('should include steps in result even on failure', async () => {
      const pipeline = new RecordingPipeline({
        baseUrl: 'http://localhost:19999',
      });

      const result = await pipeline.run();
      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
      // Should have at least the first step (validate server)
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('should store result for retrieval', async () => {
      const pipeline = new RecordingPipeline({
        baseUrl: 'http://localhost:19999',
      });

      await pipeline.run();
      const result = pipeline.getResult();
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
    }, 15000);
  });

  describe('PipelineConfig type validation', () => {
    it('should have all required fields', () => {
      const config: PipelineConfig = {
        baseUrl: 'http://localhost:3000',
        outputDir: './output',
        captureScreenshots: false,
        width: 1920,
        height: 1080,
      };
      expect(config.baseUrl).toBeDefined();
      expect(config.outputDir).toBeDefined();
      expect(typeof config.captureScreenshots).toBe('boolean');
      expect(typeof config.width).toBe('number');
      expect(typeof config.height).toBe('number');
    });
  });

  describe('PipelineStatus type validation', () => {
    it('should support all valid status values', () => {
      const validStatuses: PipelineStatus[] = [
        'idle', 'starting', 'seeding', 'capturing', 'assembling', 'completed', 'failed',
      ];
      for (const status of validStatuses) {
        expect(typeof status).toBe('string');
      }
    });
  });
});
