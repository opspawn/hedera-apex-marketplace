/**
 * Playwright Video Capture — Records demo scenes as MP4 clips + PNG screenshots
 *
 * Uses Playwright's built-in video recording to capture each scene as an
 * individual MP4 clip at 1920x1080. Also captures a PNG screenshot per scene
 * with text overlays injected via DOM manipulation.
 *
 * Output per scene:
 *   scene-{order}-{id}.mp4    — Video clip
 *   scene-{order}-{id}.png    — Screenshot with overlays
 *
 * Usage:
 *   const capture = new PlaywrightVideoCapture({ baseUrl: 'http://localhost:4003' });
 *   const result = await capture.recordAllScenes();
 */

import * as fs from 'fs';
import * as path from 'path';
import { VideoScene, getVideoScenesInOrder, getVideoAllStandards, getVideoTotalDuration } from './video-scene-definitions';
import { generateOverlayInjectionScript, generateOverlayRemovalScript } from './text-overlay';

export interface CaptureConfig {
  baseUrl: string;
  outputDir: string;
  width: number;
  height: number;
  fps: number;
  headless: boolean;
  navigationTimeout: number;
  /** Extra wait after page load before recording starts */
  settleMs: number;
}

export interface SceneCaptureResult {
  scene_id: string;
  order: number;
  title: string;
  videoPath: string | null;
  screenshotPath: string | null;
  duration_s: number;
  success: boolean;
  error?: string;
}

export interface CaptureResult {
  scenes: SceneCaptureResult[];
  outputDir: string;
  totalScenes: number;
  successCount: number;
  failCount: number;
  totalDuration_s: number;
  standards: string[];
}

const DEFAULT_CONFIG: CaptureConfig = {
  baseUrl: 'http://localhost:4003',
  outputDir: './demo-video',
  width: 1920,
  height: 1080,
  fps: 30,
  headless: true,
  navigationTimeout: 15000,
  settleMs: 2000,
};

export class PlaywrightVideoCapture {
  private config: CaptureConfig;

  constructor(config?: Partial<CaptureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): CaptureConfig {
    return { ...this.config };
  }

  /**
   * Record all 7 scenes as individual MP4 clips + PNG screenshots.
   */
  async recordAllScenes(): Promise<CaptureResult> {
    const scenes = getVideoScenesInOrder();
    const results: SceneCaptureResult[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    console.log(`\n  Playwright Video Capture — ${scenes.length} scenes`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Base URL: ${this.config.baseUrl}`);
    console.log(`  Output:   ${this.config.outputDir}`);
    console.log(`  Resolution: ${this.config.width}x${this.config.height} @ ${this.config.fps}fps\n`);

    // Seed demo data first
    await this.seedDemoData();

    for (const scene of scenes) {
      const result = await this.recordScene(scene);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n  ${'─'.repeat(50)}`);
    console.log(`  Capture complete: ${successCount}/${scenes.length} scenes`);
    console.log(`  Output: ${this.config.outputDir}\n`);

    return {
      scenes: results,
      outputDir: this.config.outputDir,
      totalScenes: scenes.length,
      successCount,
      failCount,
      totalDuration_s: getVideoTotalDuration(),
      standards: getVideoAllStandards(),
    };
  }

  /**
   * Record a single scene with Playwright video capture.
   */
  async recordScene(scene: VideoScene): Promise<SceneCaptureResult> {
    const videoFileName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.webm`;
    const mp4FileName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.mp4`;
    const screenshotFileName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.png`;

    const videoDir = path.join(this.config.outputDir, 'raw');
    const mp4Path = path.join(this.config.outputDir, mp4FileName);
    const screenshotPath = path.join(this.config.outputDir, screenshotFileName);

    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    try {
      const { chromium } = require('playwright');

      // Launch browser with video recording
      const browser = await chromium.launch({ headless: this.config.headless });
      const context = await browser.newContext({
        viewport: { width: this.config.width, height: this.config.height },
        recordVideo: {
          dir: videoDir,
          size: { width: this.config.width, height: this.config.height },
        },
      });

      const page = await context.newPage();

      // Navigate to first action target or base URL
      const navAction = scene.actions.find(a => a.type === 'navigate');
      const targetUrl = navAction?.target
        ? `${this.config.baseUrl}${navAction.target}`
        : this.config.baseUrl;

      await page.goto(targetUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.navigationTimeout,
      });

      // Wait for visual settle
      await page.waitForTimeout(this.config.settleMs);

      // Inject text overlays
      const injectionScript = generateOverlayInjectionScript({
        overlays: scene.overlays,
        containerWidth: this.config.width,
        containerHeight: this.config.height,
      });
      await page.evaluate(injectionScript);
      await page.waitForTimeout(500);

      // Execute scene actions (skip initial navigate since we already did it)
      for (const action of scene.actions) {
        if (action.type === 'navigate') continue;
        try {
          await this.executeAction(page, action);
        } catch {
          // Non-fatal: continue with remaining actions
        }
      }

      // Hold for scene duration minus settle time
      const holdMs = Math.max(1000, (scene.duration_s * 1000) - this.config.settleMs);
      await page.waitForTimeout(holdMs);

      // Capture PNG screenshot (with overlays visible)
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Remove overlays before closing
      const removalScript = generateOverlayRemovalScript();
      await page.evaluate(removalScript);

      // Close context to finalize video
      const video = page.video();
      await context.close();
      await browser.close();

      // Get the recorded video path and convert to MP4
      let finalVideoPath: string | null = null;
      if (video) {
        const webmPath = await video.path();
        if (webmPath && fs.existsSync(webmPath)) {
          // Convert WebM to MP4 using ffmpeg
          await this.convertToMp4(webmPath, mp4Path, scene.duration_s);
          finalVideoPath = mp4Path;
        }
      }

      console.log(`  [Scene ${scene.order}] ${scene.title}`);
      console.log(`     Video: ${finalVideoPath || 'N/A'}`);
      console.log(`     Screenshot: ${screenshotPath}`);
      console.log(`     Duration: ${scene.duration_s}s`);
      console.log('');

      return {
        scene_id: scene.id,
        order: scene.order,
        title: scene.title,
        videoPath: finalVideoPath,
        screenshotPath,
        duration_s: scene.duration_s,
        success: true,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.log(`  [Scene ${scene.order}] ${scene.title} — FAILED`);
      console.log(`     Error: ${errorMsg}\n`);

      return {
        scene_id: scene.id,
        order: scene.order,
        title: scene.title,
        videoPath: null,
        screenshotPath: null,
        duration_s: scene.duration_s,
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute a scene action on the Playwright page.
   */
  private async executeAction(page: any, action: VideoScene['actions'][0]): Promise<void> {
    switch (action.type) {
      case 'navigate':
        if (action.target) {
          await page.goto(`${this.config.baseUrl}${action.target}`, {
            waitUntil: 'networkidle',
            timeout: this.config.navigationTimeout,
          });
        }
        break;
      case 'click':
        if (action.target) {
          await page.click(action.target, { timeout: 5000 }).catch(() => {});
        }
        break;
      case 'type':
        if (action.target && action.value) {
          await page.fill(action.target, action.value).catch(() => {});
        }
        break;
      case 'wait':
        await page.waitForTimeout(action.waitMs || 1000);
        break;
      case 'scroll':
        if (action.target) {
          await page.evaluate(`document.querySelector('${action.target}')?.scrollIntoView({ behavior: 'smooth' })`);
        }
        break;
      case 'api-call':
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
   * Convert WebM to MP4 using ffmpeg.
   */
  private async convertToMp4(inputPath: string, outputPath: string, maxDuration: number): Promise<void> {
    const { execSync } = require('child_process');
    try {
      execSync(
        `ffmpeg -y -i "${inputPath}" -t ${maxDuration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r ${this.config.fps} -s ${this.config.width}x${this.config.height} -an "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
    } catch (err) {
      // If ffmpeg conversion fails, copy the WebM as fallback
      console.log(`     [ffmpeg conversion failed, keeping WebM]`);
      fs.copyFileSync(inputPath, outputPath.replace('.mp4', '.webm'));
    }
  }

  /**
   * Seed demo data by triggering the demo flow endpoint.
   */
  private async seedDemoData(): Promise<void> {
    try {
      console.log('  Seeding demo data...');
      const response = await fetch(`${this.config.baseUrl}/api/demo/run`, { method: 'POST' });
      if (response.ok) {
        console.log('  Demo data seeded successfully.\n');
      } else {
        console.log('  Demo seed returned non-200, continuing with existing data.\n');
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch {
      console.log('  Demo seed failed, continuing with existing data.\n');
    }
  }
}
