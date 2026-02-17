import { record, DemoRecording, RecordedStep } from '../../src/demo/recorder';
import { createApp } from '../../src/index';
import { Express } from 'express';
import http from 'http';

describe('Demo Recorder', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app } = createApp());
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('record() exports are defined', () => {
    expect(typeof record).toBe('function');
  });

  test('record() runs the full demo and captures steps', async () => {
    const recording = await record(baseUrl);

    expect(recording).toBeDefined();
    expect(recording.recorded_at).toBeDefined();
    expect(recording.base_url).toBe(baseUrl);
    expect(recording.total_steps).toBe(7);
    expect(recording.steps.length).toBe(7);
    expect(recording.total_duration_ms).toBeGreaterThan(0);
  }, 15000);

  test('recording contains health check data', async () => {
    const recording = await record(baseUrl);
    expect(recording.health).toBeDefined();
    expect(recording.health?.status).toBe('ok');
    expect(recording.health?.version).toBeDefined();
  }, 15000);

  test('recording steps have required fields', async () => {
    const recording = await record(baseUrl);
    for (const step of recording.steps) {
      expect(step.step).toBeGreaterThan(0);
      expect(step.type).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.detail).toBeDefined();
      expect(step.timestamp).toBeDefined();
      expect(step.elapsed_ms).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  test('recording steps follow expected order', async () => {
    const recording = await record(baseUrl);
    const types = recording.steps.map(s => s.type);
    expect(types).toEqual(['seed', 'search', 'select', 'hire', 'complete', 'rate', 'points']);
  }, 15000);

  test('recording summary is populated on success', async () => {
    const recording = await record(baseUrl);
    expect(recording.summary).toBeDefined();
    expect(recording.summary?.selectedAgent).toBeDefined();
    expect(recording.summary?.pointsAwarded).toBeGreaterThan(0);
    expect(recording.summary?.totalSteps).toBe(7);
  }, 15000);
});
