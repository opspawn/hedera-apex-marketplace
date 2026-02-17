/**
 * Video Stitcher — Combines scene clips into final demo video with FFmpeg
 *
 * Features:
 * - Title card (3s) with project name and HCS standards
 * - Scene clips stitched with crossfade transitions (0.5s)
 * - End card (3s) with links and credits
 * - Output: 1920x1080, 30fps, H.264, under 50MB
 *
 * Usage:
 *   const stitcher = new VideoStitcher({ inputDir: './demo-video' });
 *   await stitcher.stitch();
 */

import * as fs from 'fs';
import * as path from 'path';
import { getVideoScenesInOrder, getVideoAllStandards, getVideoTotalDuration } from './video-scene-definitions';

export interface StitcherConfig {
  inputDir: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  titleDuration: number;  // seconds
  endDuration: number;    // seconds
  crossfadeDuration: number; // seconds
  maxSizeMB: number;
}

export interface StitchResult {
  outputPath: string;
  duration_s: number;
  fileSize_bytes: number;
  fileSize_mb: number;
  success: boolean;
  scenesIncluded: number;
  error?: string;
}

const DEFAULT_CONFIG: StitcherConfig = {
  inputDir: './demo-video',
  outputPath: './demo-video/hedera-apex-demo.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  titleDuration: 3,
  endDuration: 3,
  crossfadeDuration: 0.5,
  maxSizeMB: 50,
};

export class VideoStitcher {
  private config: StitcherConfig;

  constructor(config?: Partial<StitcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): StitcherConfig {
    return { ...this.config };
  }

  /**
   * Stitch all scene clips into a single demo video.
   */
  async stitch(): Promise<StitchResult> {
    const scenes = getVideoScenesInOrder();
    const { execSync } = require('child_process');

    console.log(`\n  Video Stitcher — Assembling ${scenes.length} scenes`);
    console.log(`  ${'─'.repeat(50)}`);

    // 1. Generate title card
    const titlePath = path.join(this.config.inputDir, 'title-card.mp4');
    await this.generateTitleCard(titlePath);

    // 2. Generate end card
    const endPath = path.join(this.config.inputDir, 'end-card.mp4');
    await this.generateEndCard(endPath);

    // 3. Collect scene clip paths (in order)
    const clipPaths: string[] = [titlePath];
    let scenesIncluded = 0;

    for (const scene of scenes) {
      const mp4Name = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.mp4`;
      const clipPath = path.join(this.config.inputDir, mp4Name);
      if (fs.existsSync(clipPath)) {
        clipPaths.push(clipPath);
        scenesIncluded++;
        console.log(`  [+] ${mp4Name}`);
      } else {
        // Generate placeholder clip from screenshot
        const screenshotName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.png`;
        const screenshotPath = path.join(this.config.inputDir, screenshotName);
        if (fs.existsSync(screenshotPath)) {
          const placeholderPath = path.join(this.config.inputDir, `placeholder-${scene.order}.mp4`);
          await this.generateClipFromScreenshot(screenshotPath, placeholderPath, scene.duration_s);
          clipPaths.push(placeholderPath);
          scenesIncluded++;
          console.log(`  [~] ${mp4Name} (from screenshot)`);
        } else {
          console.log(`  [!] ${mp4Name} — missing, skipped`);
        }
      }
    }

    clipPaths.push(endPath);

    if (scenesIncluded === 0) {
      return {
        outputPath: this.config.outputPath,
        duration_s: 0,
        fileSize_bytes: 0,
        fileSize_mb: 0,
        success: false,
        scenesIncluded: 0,
        error: 'No scene clips found',
      };
    }

    // 4. Build ffmpeg concat file
    const concatListPath = path.join(this.config.inputDir, 'concat-list.txt');
    const concatLines = clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
    fs.writeFileSync(concatListPath, concatLines);

    // 5. Concatenate with crossfade transitions
    try {
      const outputDir = path.dirname(this.config.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (clipPaths.length <= 3) {
        // Simple concat for few clips
        await this.simpleConcatenate(concatListPath);
      } else {
        // Use xfade filter for crossfade transitions
        await this.crossfadeConcatenate(clipPaths);
      }

      // Verify output
      if (!fs.existsSync(this.config.outputPath)) {
        throw new Error('Output file not created');
      }

      const stats = fs.statSync(this.config.outputPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      // If over size limit, re-encode with higher compression
      if (fileSizeMB > this.config.maxSizeMB) {
        console.log(`  File size ${fileSizeMB.toFixed(1)}MB exceeds ${this.config.maxSizeMB}MB limit, re-encoding...`);
        await this.reencodeForSize(this.config.outputPath);
      }

      const finalStats = fs.statSync(this.config.outputPath);
      const totalDuration = this.config.titleDuration + getVideoTotalDuration() + this.config.endDuration;

      console.log(`\n  ${'─'.repeat(50)}`);
      console.log(`  Output: ${this.config.outputPath}`);
      console.log(`  Size: ${(finalStats.size / (1024 * 1024)).toFixed(1)}MB`);
      console.log(`  Duration: ~${totalDuration}s`);
      console.log(`  Scenes: ${scenesIncluded}\n`);

      return {
        outputPath: this.config.outputPath,
        duration_s: totalDuration,
        fileSize_bytes: finalStats.size,
        fileSize_mb: parseFloat((finalStats.size / (1024 * 1024)).toFixed(1)),
        success: true,
        scenesIncluded,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.log(`  Stitch failed: ${errorMsg}`);

      // Fallback: simple concat without transitions
      try {
        await this.simpleConcatenate(concatListPath);
        const stats = fs.statSync(this.config.outputPath);
        return {
          outputPath: this.config.outputPath,
          duration_s: this.config.titleDuration + getVideoTotalDuration() + this.config.endDuration,
          fileSize_bytes: stats.size,
          fileSize_mb: parseFloat((stats.size / (1024 * 1024)).toFixed(1)),
          success: true,
          scenesIncluded,
        };
      } catch (fallbackErr) {
        return {
          outputPath: this.config.outputPath,
          duration_s: 0,
          fileSize_bytes: 0,
          fileSize_mb: 0,
          success: false,
          scenesIncluded,
          error: errorMsg,
        };
      }
    }
  }

  /**
   * Generate a title card video clip.
   */
  async generateTitleCard(outputPath: string): Promise<void> {
    const { execSync } = require('child_process');
    const standards = getVideoAllStandards().join(' · ');
    const titleText = 'Hedera Agent Marketplace';
    const subtitleText = `Decentralized AI Agent Discovery & Hiring`;
    const standardsText = standards;

    // Use ffmpeg to generate a title card with text
    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i color=c=0x080c14:s=${this.config.width}x${this.config.height}:d=${this.config.titleDuration}:r=${this.config.fps}`,
      `-vf "drawtext=text='${this.escapeFFmpegText(titleText)}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-60:font=sans-serif,` +
      `drawtext=text='${this.escapeFFmpegText(subtitleText)}':fontcolor=0xaaaaaa:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+20:font=sans-serif,` +
      `drawtext=text='${this.escapeFFmpegText(standardsText)}':fontcolor=0x00d4ff:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+80:font=sans-serif"`,
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p`,
      `"${outputPath}"`,
    ].join(' ');

    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30000 });
      console.log(`  Title card: ${outputPath}`);
    } catch {
      // Fallback: black frame title card without text
      execSync(
        `ffmpeg -y -f lavfi -i color=c=0x080c14:s=${this.config.width}x${this.config.height}:d=${this.config.titleDuration}:r=${this.config.fps} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      console.log(`  Title card (no text): ${outputPath}`);
    }
  }

  /**
   * Generate an end card video clip.
   */
  async generateEndCard(outputPath: string): Promise<void> {
    const { execSync } = require('child_process');
    const titleText = 'Hedera Agent Marketplace';
    const urlText = 'hedera.opspawn.com';
    const creditText = 'Built by OpSpawn — Hedera Apex 2026';

    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i color=c=0x080c14:s=${this.config.width}x${this.config.height}:d=${this.config.endDuration}:r=${this.config.fps}`,
      `-vf "drawtext=text='${this.escapeFFmpegText(titleText)}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-50:font=sans-serif,` +
      `drawtext=text='${this.escapeFFmpegText(urlText)}':fontcolor=0x00d4ff:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+20:font=sans-serif,` +
      `drawtext=text='${this.escapeFFmpegText(creditText)}':fontcolor=0x888888:fontsize=18:x=(w-text_w)/2:y=(h-text_h)/2+70:font=sans-serif"`,
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p`,
      `"${outputPath}"`,
    ].join(' ');

    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30000 });
      console.log(`  End card: ${outputPath}`);
    } catch {
      execSync(
        `ffmpeg -y -f lavfi -i color=c=0x080c14:s=${this.config.width}x${this.config.height}:d=${this.config.endDuration}:r=${this.config.fps} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      console.log(`  End card (no text): ${outputPath}`);
    }
  }

  /**
   * Generate a video clip from a screenshot image.
   */
  async generateClipFromScreenshot(imagePath: string, outputPath: string, duration: number): Promise<void> {
    const { execSync } = require('child_process');
    execSync(
      `ffmpeg -y -loop 1 -i "${imagePath}" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r ${this.config.fps} -s ${this.config.width}x${this.config.height} -an "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
  }

  /**
   * Simple concat (no crossfade) using ffmpeg concat demuxer.
   */
  private async simpleConcatenate(concatListPath: string): Promise<void> {
    const { execSync } = require('child_process');
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r ${this.config.fps} -s ${this.config.width}x${this.config.height} -an "${this.config.outputPath}"`,
      { stdio: 'pipe', timeout: 300000 }
    );
  }

  /**
   * Concatenate clips with xfade crossfade transitions.
   */
  private async crossfadeConcatenate(clipPaths: string[]): Promise<void> {
    const { execSync } = require('child_process');

    if (clipPaths.length < 2) {
      // Nothing to crossfade
      const concatListPath = path.join(this.config.inputDir, 'concat-list.txt');
      await this.simpleConcatenate(concatListPath);
      return;
    }

    // Get durations of each clip
    const durations = clipPaths.map(p => this.getClipDuration(p));

    // Build xfade filter chain
    const inputs = clipPaths.map((p, i) => `-i "${p}"`).join(' ');
    const xfadeDur = this.config.crossfadeDuration;

    // Build filter chain incrementally
    let filterParts: string[] = [];
    let prevLabel = '[0:v]';
    let offsetAcc = durations[0] - xfadeDur;

    for (let i = 1; i < clipPaths.length; i++) {
      const outLabel = i === clipPaths.length - 1 ? '[outv]' : `[v${i}]`;
      filterParts.push(
        `${prevLabel}[${i}:v]xfade=transition=fade:duration=${xfadeDur}:offset=${Math.max(0, offsetAcc)}${outLabel}`
      );
      prevLabel = outLabel;
      if (i < clipPaths.length - 1) {
        offsetAcc += durations[i] - xfadeDur;
      }
    }

    const filterComplex = filterParts.join(';');

    try {
      execSync(
        `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r ${this.config.fps} -an "${this.config.outputPath}"`,
        { stdio: 'pipe', timeout: 300000 }
      );
    } catch {
      // Fallback to simple concat
      console.log('  Crossfade failed, falling back to simple concat...');
      const concatListPath = path.join(this.config.inputDir, 'concat-list.txt');
      await this.simpleConcatenate(concatListPath);
    }
  }

  /**
   * Re-encode to fit within the size limit.
   */
  private async reencodeForSize(filePath: string): Promise<void> {
    const { execSync } = require('child_process');
    const tmpPath = filePath + '.tmp.mp4';
    const targetBitrate = Math.floor((this.config.maxSizeMB * 8 * 1024) / getVideoTotalDuration()); // kbps

    execSync(
      `ffmpeg -y -i "${filePath}" -c:v libx264 -b:v ${targetBitrate}k -maxrate ${targetBitrate * 1.5}k -bufsize ${targetBitrate * 2}k -preset medium -pix_fmt yuv420p -an "${tmpPath}"`,
      { stdio: 'pipe', timeout: 300000 }
    );

    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Get clip duration using ffprobe.
   */
  private getClipDuration(clipPath: string): number {
    const { execSync } = require('child_process');
    try {
      const result = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${clipPath}"`,
        { stdio: 'pipe', timeout: 10000 }
      );
      return parseFloat(result.toString().trim()) || 5;
    } catch {
      return 5; // Default fallback
    }
  }

  /**
   * Escape text for ffmpeg drawtext filter.
   */
  private escapeFFmpegText(text: string): string {
    return text
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/%/g, '%%');
  }
}

/**
 * Generate an ffmpeg command to stitch screenshots into a slideshow video
 * (fallback when Playwright video recording is unavailable).
 */
export function generateScreenshotSlideshowCommand(
  screenshotDir: string,
  outputPath: string,
  sceneDurations: number[],
  config: { width: number; height: number; fps: number; crossfadeDuration: number } = {
    width: 1920, height: 1080, fps: 30, crossfadeDuration: 0.5,
  },
): string {
  const scenes = getVideoScenesInOrder();
  const inputs: string[] = [];
  const filterParts: string[] = [];

  // Build input list from screenshots
  for (const scene of scenes) {
    const screenshotName = `scene-${String(scene.order).padStart(2, '0')}-${scene.id}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotName);
    inputs.push(`-loop 1 -t ${scene.duration_s} -i "${screenshotPath}"`);
  }

  // Scale all inputs to target resolution
  for (let i = 0; i < scenes.length; i++) {
    filterParts.push(`[${i}:v]scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${config.fps}[v${i}]`);
  }

  // Crossfade between consecutive clips
  let prevLabel = '[v0]';
  let offsetAcc = sceneDurations[0] || scenes[0].duration_s;

  for (let i = 1; i < scenes.length; i++) {
    offsetAcc -= config.crossfadeDuration;
    const outLabel = i === scenes.length - 1 ? '[outv]' : `[xf${i}]`;
    filterParts.push(
      `${prevLabel}[v${i}]xfade=transition=fade:duration=${config.crossfadeDuration}:offset=${Math.max(0, offsetAcc)}${outLabel}`
    );
    prevLabel = outLabel;
    offsetAcc += sceneDurations[i] || scenes[i].duration_s;
  }

  // Handle single scene case
  if (scenes.length === 1) {
    filterParts.push('[v0]null[outv]');
  }

  const filterComplex = filterParts.join(';');

  return `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterComplex}" -map "[outv]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r ${config.fps} -an "${outputPath}"`;
}
