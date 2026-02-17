/**
 * Demo Scene Recorder — Playwright-based video pipeline
 *
 * Navigates the live dashboard (localhost:3000) through a defined
 * sequence of scenes, captures screenshots with text overlays,
 * and generates a scene manifest for video assembly.
 *
 * Output structure:
 *   {outputDir}/
 *     manifest.json          — Full recording manifest
 *     scene-01-*.png         — Screenshot per scene
 *     scenes/                — Individual scene metadata
 *
 * Usage:
 *   npx ts-node src/demo/demo-scene-recorder.ts [--base-url URL] [--output-dir DIR]
 */

import { DemoScene, DEMO_SCENES, getScenesInOrder, getAllStandards, getTotalDuration } from './scene-definitions';
import { generateOverlayInjectionScript, generateOverlayRemovalScript } from './text-overlay';

export interface SceneRecording {
  scene_id: string;
  order: number;
  title: string;
  description: string;
  screenshot_path: string | null;
  duration_ms: number;
  hcs_standards: string[];
  narration: string;
  captured_at: string;
  success: boolean;
  error?: string;
}

export interface RecordingManifest {
  title: string;
  version: string;
  recorded_at: string;
  base_url: string;
  output_dir: string;
  resolution: { width: number; height: number };
  fps: number;
  total_scenes: number;
  total_duration_ms: number;
  estimated_video_length_s: number;
  scenes: SceneRecording[];
  standards_demonstrated: string[];
  summary: {
    scenes_captured: number;
    scenes_failed: number;
    total_screenshots: number;
    standards_count: number;
  };
}

export interface DemoSceneRecorderConfig {
  baseUrl: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  captureScreenshots: boolean;
  headless: boolean;
  screenshotRetries: number;
  screenshotRetryDelay: number;
  navigationTimeout: number;
}

const DEFAULT_CONFIG: DemoSceneRecorderConfig = {
  baseUrl: 'http://localhost:3000',
  outputDir: './demo-video',
  width: 1920,
  height: 1080,
  fps: 30,
  captureScreenshots: false,
  headless: true,
  screenshotRetries: 3,
  screenshotRetryDelay: 1000,
  navigationTimeout: 15000,
};

/**
 * DemoSceneRecorder orchestrates the full demo recording pipeline.
 *
 * It navigates through each scene defined in scene-definitions.ts,
 * optionally captures screenshots with Playwright, injects text overlays,
 * and produces a manifest for ffmpeg-based video assembly.
 */
export class DemoSceneRecorder {
  private config: DemoSceneRecorderConfig;
  private recordings: SceneRecording[] = [];

  constructor(config?: Partial<DemoSceneRecorderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record all scenes and return the manifest.
   */
  async record(): Promise<RecordingManifest> {
    this.recordings = [];
    const scenes = getScenesInOrder();

    console.log(`\n  Demo Scene Recorder — ${scenes.length} scenes`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Base URL: ${this.config.baseUrl}`);
    console.log(`  Output:   ${this.config.outputDir}`);
    console.log(`  Resolution: ${this.config.width}x${this.config.height} @ ${this.config.fps}fps`);
    console.log(`  Screenshots: ${this.config.captureScreenshots ? 'ENABLED' : 'metadata-only'}\n`);

    for (const scene of scenes) {
      await this.recordScene(scene);
    }

    const successCount = this.recordings.filter(r => r.success).length;
    const failCount = this.recordings.filter(r => !r.success).length;
    const screenshotCount = this.recordings.filter(r => r.screenshot_path !== null).length;

    const manifest: RecordingManifest = {
      title: 'Hedera Agent Marketplace — Apex Demo Video',
      version: '0.14.0',
      recorded_at: new Date().toISOString(),
      base_url: this.config.baseUrl,
      output_dir: this.config.outputDir,
      resolution: { width: this.config.width, height: this.config.height },
      fps: this.config.fps,
      total_scenes: scenes.length,
      total_duration_ms: getTotalDuration(),
      estimated_video_length_s: Math.round(getTotalDuration() / 1000),
      scenes: this.recordings,
      standards_demonstrated: getAllStandards(),
      summary: {
        scenes_captured: successCount,
        scenes_failed: failCount,
        total_screenshots: screenshotCount,
        standards_count: getAllStandards().length,
      },
    };

    console.log(`\n  ${'─'.repeat(50)}`);
    console.log(`  Recording complete: ${successCount}/${scenes.length} scenes captured`);
    console.log(`  Screenshots: ${screenshotCount}`);
    console.log(`  Standards: ${manifest.standards_demonstrated.join(', ')}`);
    console.log(`  Est. video: ${manifest.estimated_video_length_s}s\n`);

    return manifest;
  }

  /**
   * Record a single scene.
   */
  private async recordScene(scene: DemoScene): Promise<void> {
    const recording: SceneRecording = {
      scene_id: scene.id,
      order: scene.order,
      title: scene.title,
      description: scene.description,
      screenshot_path: null,
      duration_ms: scene.duration_ms,
      hcs_standards: scene.hcs_standards,
      narration: scene.narration,
      captured_at: new Date().toISOString(),
      success: false,
    };

    try {
      if (this.config.captureScreenshots) {
        const screenshotPath = `${this.config.outputDir}/${scene.screenshot_name}.png`;
        await this.captureSceneScreenshot(scene, screenshotPath);
        recording.screenshot_path = screenshotPath;
      }
      recording.success = true;

      console.log(`  [Scene ${scene.order}] ${scene.title}`);
      console.log(`     Standards: ${scene.hcs_standards.join(', ')}`);
      console.log(`     Duration: ${scene.duration_ms}ms`);
      if (recording.screenshot_path) {
        console.log(`     Screenshot: ${recording.screenshot_path}`);
      }
      console.log('');
    } catch (err) {
      recording.error = err instanceof Error ? err.message : 'Unknown error';
      recording.success = false;
      console.log(`  [Scene ${scene.order}] ${scene.title} — FAILED`);
      console.log(`     Error: ${recording.error}\n`);
    }

    this.recordings.push(recording);
  }

  /**
   * Capture a screenshot for a scene using Playwright.
   * Navigates to the scene URL, executes actions, injects overlays,
   * and captures the screenshot.
   */
  private async captureSceneScreenshot(scene: DemoScene, outputPath: string): Promise<void> {
    const maxRetries = this.config.screenshotRetries;
    const retryDelay = this.config.screenshotRetryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: this.config.headless });
        const page = await browser.newPage({
          viewport: { width: this.config.width, height: this.config.height },
        });

        // Navigate to the scene's first navigate action
        const navAction = scene.actions.find(a => a.type === 'navigate');
        const targetUrl = navAction?.target
          ? `${this.config.baseUrl}${navAction.target}`
          : this.config.baseUrl;

        await page.goto(targetUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.navigationTimeout,
        });

        // Execute scene actions
        for (const action of scene.actions) {
          try {
            await this.executeAction(page, action);
          } catch {
            // Non-fatal: continue with remaining actions
          }
        }

        // Inject text overlays
        const injectionScript = generateOverlayInjectionScript({
          overlays: scene.overlays,
          containerWidth: this.config.width,
          containerHeight: this.config.height,
        });
        await page.evaluate(injectionScript);

        // Wait for overlays to render
        await page.waitForTimeout(300);

        // Ensure output directory exists
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Capture screenshot
        await page.screenshot({ path: outputPath, fullPage: false });

        // Clean up
        const removalScript = generateOverlayRemovalScript();
        await page.evaluate(removalScript);

        await browser.close();
        return; // Success
      } catch (err) {
        if (attempt < maxRetries) {
          console.log(`     [Screenshot attempt ${attempt}/${maxRetries} failed — retrying in ${retryDelay}ms]`);
          await new Promise(r => setTimeout(r, retryDelay));
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Execute a scene action on the Playwright page.
   */
  private async executeAction(page: unknown, action: DemoScene['actions'][0]): Promise<void> {
    // Type assertion for Playwright Page — dynamic require means no static types
    const p = page as {
      goto: (url: string, opts?: Record<string, unknown>) => Promise<void>;
      click: (selector: string, opts?: Record<string, unknown>) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
      waitForTimeout: (ms: number) => Promise<void>;
      evaluate: (fn: string) => Promise<void>;
    };

    switch (action.type) {
      case 'navigate':
        if (action.target) {
          await p.goto(`${this.config.baseUrl}${action.target}`, {
            waitUntil: 'networkidle',
            timeout: this.config.navigationTimeout,
          });
        }
        break;
      case 'click':
        if (action.target) {
          await p.click(action.target, { timeout: 5000 }).catch(() => {});
        }
        break;
      case 'type':
        if (action.target && action.value) {
          await p.fill(action.target, action.value);
        }
        break;
      case 'wait':
        await p.waitForTimeout(action.waitMs || 1000);
        break;
      case 'scroll':
        if (action.target) {
          await p.evaluate(`document.querySelector('${action.target}')?.scrollIntoView({ behavior: 'smooth' })`);
        }
        break;
      case 'api-call':
        // API calls are handled separately — used for triggering demo flow
        if (action.target) {
          try {
            const method = action.value || 'GET';
            await fetch(`${this.config.baseUrl}${action.target}`, { method });
          } catch {
            // Non-fatal
          }
        }
        break;
    }
  }

  /**
   * Get recordings captured so far.
   */
  getRecordings(): SceneRecording[] {
    return [...this.recordings];
  }

  /**
   * Get current config.
   */
  getConfig(): DemoSceneRecorderConfig {
    return { ...this.config };
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base-url');
  const baseUrl = baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : 'http://localhost:3000';
  const outIdx = args.indexOf('--output-dir');
  const outputDir = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : './demo-video';
  const screenshots = args.includes('--screenshots');

  const recorder = new DemoSceneRecorder({
    baseUrl,
    outputDir,
    captureScreenshots: screenshots,
  });

  recorder.record()
    .then(manifest => {
      const fs = require('fs');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outPath = `${outputDir}/manifest.json`;
      fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
      console.log(`  Manifest saved to ${outPath}\n`);
    })
    .catch(err => {
      console.error(`\n  Error: ${err.message}\n`);
      process.exit(1);
    });
}
