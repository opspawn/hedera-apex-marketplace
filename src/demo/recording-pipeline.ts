/**
 * Recording Pipeline — Orchestrates the full demo video capture.
 *
 * Pipeline steps:
 * 1. Validate server is running
 * 2. Run demo flow to seed data
 * 3. Capture screenshots for each scene
 * 4. Generate video manifest with transitions and narration
 *
 * Exposed as the /demo/record endpoint.
 */

import { DemoSceneRecorder, RecordingManifest } from './demo-scene-recorder';
import { buildNarrationScript, NarrationScript } from './narration-script';
import { getTransitionsInOrder, getTotalTransitionTime, SceneTransition } from './scene-transitions';

export type PipelineStatus = 'idle' | 'starting' | 'seeding' | 'capturing' | 'assembling' | 'completed' | 'failed';

export interface PipelineStep {
  step: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  detail?: string;
  error?: string;
}

export interface PipelineResult {
  status: PipelineStatus;
  started_at: string;
  completed_at?: string;
  steps: PipelineStep[];
  manifest?: RecordingManifest & {
    transitions: SceneTransition[];
    narration: NarrationScript;
    total_with_transitions_ms: number;
  };
  error?: string;
}

export interface PipelineConfig {
  baseUrl: string;
  outputDir: string;
  captureScreenshots: boolean;
  width: number;
  height: number;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  baseUrl: 'http://localhost:3000',
  outputDir: './demo-video',
  captureScreenshots: false,
  width: 1920,
  height: 1080,
};

/**
 * RecordingPipeline orchestrates the full demo recording workflow.
 */
export class RecordingPipeline {
  private config: PipelineConfig;
  private status: PipelineStatus = 'idle';
  private result: PipelineResult | null = null;
  private steps: PipelineStep[] = [];

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  /**
   * Get current pipeline status.
   */
  getStatus(): PipelineStatus {
    return this.status;
  }

  /**
   * Get the full result (available after run completes).
   */
  getResult(): PipelineResult | null {
    return this.result;
  }

  /**
   * Get pipeline config.
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Run the full recording pipeline.
   */
  async run(): Promise<PipelineResult> {
    if (this.status !== 'idle' && this.status !== 'completed' && this.status !== 'failed') {
      return this.result || this.createResult('failed', 'Pipeline already running');
    }

    this.steps = [];
    const startedAt = new Date().toISOString();
    this.status = 'starting';
    this.result = null;

    try {
      // Step 1: Validate server
      this.addStep(1, 'Validate Server');
      await this.validateServer();
      this.completeStep(1, 'Server is reachable');

      // Step 2: Seed demo data
      this.status = 'seeding';
      this.addStep(2, 'Seed Demo Data');
      await this.seedData();
      this.completeStep(2, 'Demo flow triggered');

      // Step 3: Capture scenes
      this.status = 'capturing';
      this.addStep(3, 'Capture Scene Screenshots');
      const manifest = await this.captureScenes();
      this.completeStep(3, `${manifest.summary.scenes_captured}/${manifest.total_scenes} scenes captured`);

      // Step 4: Assemble manifest with transitions and narration
      this.status = 'assembling';
      this.addStep(4, 'Assemble Video Manifest');
      const narration = buildNarrationScript();
      const transitions = getTransitionsInOrder();
      const transitionTime = getTotalTransitionTime();
      this.completeStep(4, `Manifest assembled: ${narration.summary.total_words} words, ${transitions.length} transitions`);

      // Complete
      this.status = 'completed';
      this.result = {
        status: 'completed',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        steps: this.steps,
        manifest: {
          ...manifest,
          transitions,
          narration,
          total_with_transitions_ms: manifest.total_duration_ms + transitionTime,
        },
      };

      return this.result;
    } catch (err) {
      this.status = 'failed';
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.result = this.createResult('failed', errorMsg, startedAt);
      return this.result;
    }
  }

  /**
   * Validate the server is reachable.
   */
  private async validateServer(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (err) {
      throw new Error(`Server not reachable at ${this.config.baseUrl}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * Trigger demo flow to ensure data is seeded.
   */
  private async seedData(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/demo/run`, { method: 'POST' });
      if (!response.ok) {
        // Not fatal — data may already be seeded
        console.log('Demo seed returned non-200, continuing...');
      }
      // Wait for demo to settle
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      // Not fatal — seed may already exist
      console.log('Demo seed failed, continuing with existing data...');
    }
  }

  /**
   * Capture screenshots for all scenes.
   */
  private async captureScenes(): Promise<RecordingManifest> {
    const recorder = new DemoSceneRecorder({
      baseUrl: this.config.baseUrl,
      outputDir: this.config.outputDir,
      captureScreenshots: this.config.captureScreenshots,
      width: this.config.width,
      height: this.config.height,
    });

    return recorder.record();
  }

  private addStep(step: number, name: string): void {
    this.steps.push({
      step,
      name,
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  private completeStep(step: number, detail: string): void {
    const s = this.steps.find(s => s.step === step);
    if (s) {
      s.status = 'completed';
      s.completed_at = new Date().toISOString();
      s.detail = detail;
    }
  }

  private createResult(status: PipelineStatus, error: string, startedAt?: string): PipelineResult {
    return {
      status,
      started_at: startedAt || new Date().toISOString(),
      completed_at: new Date().toISOString(),
      steps: this.steps,
      error,
    };
  }
}
