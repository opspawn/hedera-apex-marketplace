#!/usr/bin/env ts-node
/**
 * record-demo.ts — Full demo video recording orchestrator
 *
 * Records 7 demo scenes from the Hedera Agent Marketplace dashboard
 * using Playwright, then stitches them into a final MP4 with FFmpeg.
 *
 * Usage:
 *   npx ts-node scripts/record-demo.ts [options]
 *
 * Options:
 *   --base-url URL     Dashboard base URL (default: http://localhost:4003)
 *   --output-dir DIR   Output directory (default: ./demo-video)
 *   --screenshots-only Skip video recording, capture screenshots only
 *   --stitch-only      Skip recording, stitch existing clips
 *   --no-stitch        Record scenes but don't stitch
 *   --headless         Run browser headless (default: true)
 *   --no-headless      Run browser with visible window
 *
 * Output:
 *   demo-video/
 *     scene-01-dashboard-overview.mp4    — Individual scene clips
 *     scene-01-dashboard-overview.png    — Scene screenshots with overlays
 *     ...
 *     title-card.mp4                     — Title card (3s)
 *     end-card.mp4                       — End card (3s)
 *     hedera-apex-demo.mp4              — Final stitched video
 *     manifest.json                      — Recording manifest
 */

import * as fs from 'fs';
import * as path from 'path';
import { PlaywrightVideoCapture, CaptureResult } from '../src/demo/playwright-video-capture';
import { VideoStitcher, StitchResult } from '../src/demo/video-stitcher';
import { getVideoScenesInOrder, getVideoAllStandards, getVideoTotalDuration } from '../src/demo/video-scene-definitions';

interface DemoRecordingOptions {
  baseUrl: string;
  outputDir: string;
  screenshotsOnly: boolean;
  stitchOnly: boolean;
  noStitch: boolean;
  headless: boolean;
}

interface DemoManifest {
  title: string;
  version: string;
  recorded_at: string;
  base_url: string;
  output_dir: string;
  resolution: { width: number; height: number };
  fps: number;
  scenes: Array<{
    id: string;
    order: number;
    title: string;
    video: string | null;
    screenshot: string | null;
    duration_s: number;
    standards: string[];
    success: boolean;
  }>;
  stitch?: {
    output: string;
    duration_s: number;
    size_mb: number;
    success: boolean;
  };
  standards_demonstrated: string[];
  total_scenes: number;
  total_duration_s: number;
}

function parseArgs(): DemoRecordingOptions {
  const args = process.argv.slice(2);

  const getArg = (flag: string, defaultVal: string): string => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
  };

  return {
    baseUrl: getArg('--base-url', 'http://localhost:4003'),
    outputDir: getArg('--output-dir', './demo-video'),
    screenshotsOnly: args.includes('--screenshots-only'),
    stitchOnly: args.includes('--stitch-only'),
    noStitch: args.includes('--no-stitch'),
    headless: !args.includes('--no-headless'),
  };
}

async function validateServer(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) {
      console.error(`  Server returned ${response.status}`);
      return false;
    }
    const data = await response.json() as any;
    console.log(`  Server: ${data.service} v${data.version}`);
    console.log(`  Uptime: ${data.uptime}`);
    console.log(`  Standards: ${data.standards?.join(', ')}`);
    return true;
  } catch (err) {
    console.error(`  Server not reachable at ${baseUrl}`);
    return false;
  }
}

async function recordScreenshotsOnly(options: DemoRecordingOptions): Promise<CaptureResult> {
  const capture = new PlaywrightVideoCapture({
    baseUrl: options.baseUrl,
    outputDir: options.outputDir,
    headless: options.headless,
  });

  // For screenshots-only, we still use the full capture but the
  // scene results won't have video paths
  return capture.recordAllScenes();
}

async function main(): Promise<void> {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║    Hedera Agent Marketplace — Demo Video     ║');
  console.log('  ╚══════════════════════════════════════════════╝\n');

  // Step 1: Validate server
  console.log('  Step 1: Validate server');
  const serverOk = await validateServer(options.baseUrl);
  if (!serverOk) {
    console.error('\n  ERROR: Dashboard server is not running.');
    console.error('  Start it with: npm run dev (or npm start)');
    console.error(`  Expected at: ${options.baseUrl}\n`);
    process.exit(1);
  }
  console.log('  Server OK.\n');

  let captureResult: CaptureResult | null = null;
  let stitchResult: StitchResult | null = null;

  // Step 2: Record scenes
  if (!options.stitchOnly) {
    console.log('  Step 2: Record demo scenes');
    const capture = new PlaywrightVideoCapture({
      baseUrl: options.baseUrl,
      outputDir: options.outputDir,
      headless: options.headless,
    });

    captureResult = await capture.recordAllScenes();

    if (captureResult.successCount === 0) {
      console.error('\n  ERROR: No scenes were captured successfully.');
      process.exit(1);
    }
  }

  // Step 3: Stitch video
  if (!options.noStitch && !options.screenshotsOnly) {
    console.log('  Step 3: Stitch video');
    const stitcher = new VideoStitcher({
      inputDir: options.outputDir,
      outputPath: path.join(options.outputDir, 'hedera-apex-demo.mp4'),
    });

    stitchResult = await stitcher.stitch();
  }

  // Step 4: Write manifest
  const scenes = getVideoScenesInOrder();
  const manifest: DemoManifest = {
    title: 'Hedera Agent Marketplace — Apex Demo Video',
    version: '0.16.0',
    recorded_at: new Date().toISOString(),
    base_url: options.baseUrl,
    output_dir: options.outputDir,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    scenes: scenes.map(scene => {
      const sceneResult = captureResult?.scenes.find(s => s.scene_id === scene.id);
      return {
        id: scene.id,
        order: scene.order,
        title: scene.title,
        video: sceneResult?.videoPath || null,
        screenshot: sceneResult?.screenshotPath || null,
        duration_s: scene.duration_s,
        standards: scene.hcs_standards,
        success: sceneResult?.success ?? false,
      };
    }),
    stitch: stitchResult ? {
      output: stitchResult.outputPath,
      duration_s: stitchResult.duration_s,
      size_mb: stitchResult.fileSize_mb,
      success: stitchResult.success,
    } : undefined,
    standards_demonstrated: getVideoAllStandards(),
    total_scenes: scenes.length,
    total_duration_s: getVideoTotalDuration(),
  };

  const manifestPath = path.join(options.outputDir, 'manifest.json');
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║              Recording Complete               ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(`  Scenes: ${captureResult?.successCount ?? 0}/${scenes.length}`);
  console.log(`  Standards: ${getVideoAllStandards().join(', ')}`);
  if (stitchResult?.success) {
    console.log(`  Final video: ${stitchResult.outputPath}`);
    console.log(`  Size: ${stitchResult.fileSize_mb}MB`);
  }
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Time: ${elapsed}s\n`);
}

main().catch(err => {
  console.error(`\n  Fatal error: ${err.message}\n`);
  process.exit(1);
});
