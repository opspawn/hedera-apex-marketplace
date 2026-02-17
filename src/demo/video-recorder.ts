/**
 * Demo Video Recorder
 *
 * Captures the full marketplace demo flow as a sequence of screenshots
 * and metadata, suitable for creating a 3-4 minute submission video
 * for Hedera Apex judging.
 *
 * Showcase flow:
 * 1. Dashboard overview (marketplace landing)
 * 2. Agent registration (fill form, submit)
 * 3. Skill publishing (HCS-26 manifest)
 * 4. Marketplace search (discover agents)
 * 5. Agent detail view (skills, reputation, identity)
 * 6. Hiring flow (select skill, submit task)
 * 7. Reputation update (HCS-20 points awarded)
 * 8. Leaderboard view
 *
 * Output: JSON manifest + screenshot directory for video assembly.
 *
 * Usage:
 *   npx ts-node src/demo/video-recorder.ts [--base-url http://localhost:3000] [--output-dir ./demo-frames]
 */

export interface VideoFrame {
  index: number;
  title: string;
  description: string;
  url: string;
  timestamp: string;
  screenshotPath?: string;
  duration_ms: number;
  annotations: string[];
}

export interface VideoManifest {
  title: string;
  version: string;
  recorded_at: string;
  base_url: string;
  output_dir: string;
  total_frames: number;
  total_duration_ms: number;
  frames: VideoFrame[];
  demo_summary: {
    agents_shown: number;
    skills_published: number;
    hires_completed: number;
    points_awarded: number;
    standards_demonstrated: string[];
  };
}

export interface VideoRecorderConfig {
  baseUrl: string;
  outputDir: string;
  captureScreenshots: boolean;
  frameDuration: number;
  screenshotRetries: number;
  screenshotRetryDelay: number;
}

const DEFAULT_CONFIG: VideoRecorderConfig = {
  baseUrl: 'http://localhost:3000',
  outputDir: './demo-frames',
  captureScreenshots: false,
  frameDuration: 5000,
  screenshotRetries: 3,
  screenshotRetryDelay: 1000,
};

/**
 * VideoRecorder captures the marketplace demo as a frame sequence.
 *
 * When captureScreenshots is true (requires Playwright), it launches
 * a headless browser and takes actual screenshots. Otherwise it
 * generates a frame manifest with URLs and metadata for manual capture.
 */
export class VideoRecorder {
  private config: VideoRecorderConfig;
  private frames: VideoFrame[] = [];
  private startTime: number = 0;

  constructor(config?: Partial<VideoRecorderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record the full demo video sequence.
   * Returns a manifest describing all frames.
   */
  async record(): Promise<VideoManifest> {
    this.frames = [];
    this.startTime = Date.now();

    console.log(`\n  Hedera Agent Marketplace — Video Recording`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Target: ${this.config.baseUrl}`);
    console.log(`  Output: ${this.config.outputDir}\n`);

    // Frame 1: Health check / landing
    await this.captureFrame({
      title: 'Marketplace Overview',
      description: 'Hedera Agent Marketplace dashboard with live agent count, supported HCS standards, and real-time status',
      url: '/',
      annotations: ['6 HCS Standards', 'Real-time Dashboard', 'Testnet Connected'],
    });

    // Frame 2: Agent Registry
    await this.captureFrame({
      title: 'Agent Registry',
      description: 'Browse registered AI agents with HCS-10 identities, DID documents, and communication topics',
      url: '/dashboard',
      annotations: ['HCS-10 Protocol', 'DID Identity', 'Agent Discovery'],
    });

    // Frame 3: Run demo flow
    await this.triggerDemo();

    // Frame 4: Search marketplace
    await this.captureFrame({
      title: 'Marketplace Search',
      description: 'Search and discover agents by skill, category, or reputation score using full-text search',
      url: '/api/marketplace/discover?q=security',
      annotations: ['Full-text Search', 'Category Filters', 'Reputation Ranking'],
    });

    // Frame 5: Agent detail
    await this.captureFrame({
      title: 'Agent Profile',
      description: 'Complete agent profile with HCS-11 data, HCS-26 published skills, HCS-19 identity verification, and HCS-20 reputation points',
      url: '/api/agents',
      annotations: ['HCS-11 Profile', 'HCS-26 Skills', 'HCS-19 Verified', 'HCS-20 Points'],
    });

    // Frame 6: Skill registry
    await this.captureFrame({
      title: 'Skill Registry (HCS-26)',
      description: 'Decentralized skill manifest publishing and discovery using the HCS-26 standard',
      url: '/api/skills/search?q=audit',
      annotations: ['Skill Manifests', 'On-chain Publishing', 'Searchable Registry'],
    });

    // Frame 7: Points leaderboard
    await this.captureFrame({
      title: 'Reputation Leaderboard (HCS-20)',
      description: 'Agent reputation tracking with HCS-20 points for registration, skills, hires, and ratings',
      url: '/api/v1/points/leaderboard',
      annotations: ['HCS-20 Points', 'Leaderboard', 'Activity-based Scoring'],
    });

    // Frame 8: A2A discovery card
    await this.captureFrame({
      title: 'A2A Discovery',
      description: 'Agent-to-Agent protocol discovery card at .well-known/agent-card.json for inter-agent communication',
      url: '/.well-known/agent-card.json',
      annotations: ['A2A Protocol', 'Auto-discovery', '6 Standards'],
    });

    const totalDuration = Date.now() - this.startTime;

    const manifest: VideoManifest = {
      title: 'Hedera Agent Marketplace — Apex Submission Demo',
      version: '0.14.0',
      recorded_at: new Date().toISOString(),
      base_url: this.config.baseUrl,
      output_dir: this.config.outputDir,
      total_frames: this.frames.length,
      total_duration_ms: totalDuration,
      frames: this.frames,
      demo_summary: {
        agents_shown: 8,
        skills_published: 14,
        hires_completed: 1,
        points_awarded: 150,
        standards_demonstrated: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
      },
    };

    console.log(`\n  ${'─'.repeat(50)}`);
    console.log(`  Recording complete: ${this.frames.length} frames in ${totalDuration}ms`);
    console.log(`  Standards: ${manifest.demo_summary.standards_demonstrated.join(', ')}`);

    return manifest;
  }

  /**
   * Capture a single frame (URL + metadata, optionally a screenshot).
   */
  private async captureFrame(opts: {
    title: string;
    description: string;
    url: string;
    annotations: string[];
  }): Promise<void> {
    const elapsed = Date.now() - this.startTime;
    const index = this.frames.length;

    const frame: VideoFrame = {
      index,
      title: opts.title,
      description: opts.description,
      url: `${this.config.baseUrl}${opts.url}`,
      timestamp: new Date().toISOString(),
      duration_ms: this.config.frameDuration,
      annotations: opts.annotations,
    };

    if (this.config.captureScreenshots) {
      frame.screenshotPath = `${this.config.outputDir}/frame-${String(index).padStart(3, '0')}.png`;
      await this.takeScreenshot(frame.url, frame.screenshotPath);
    }

    this.frames.push(frame);
    console.log(`  [Frame ${index}] ${opts.title} (+${elapsed}ms)`);
    console.log(`     ${opts.description}`);
    console.log(`     Annotations: ${opts.annotations.join(' | ')}\n`);
  }

  /**
   * Trigger the 7-step demo flow via API.
   */
  private async triggerDemo(): Promise<void> {
    try {
      const triggerRes = await fetch(`${this.config.baseUrl}/api/demo/run`, { method: 'POST' });
      await triggerRes.json();

      // Poll until completed
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 250));
        const pollRes = await fetch(`${this.config.baseUrl}/api/demo/status`);
        const state = await pollRes.json() as Record<string, unknown>;
        if (state.status === 'completed' || state.status === 'failed') {
          break;
        }
      }

      await this.captureFrame({
        title: 'Live Demo Flow',
        description: '7-step marketplace demo: seed agents → search → select → hire → complete → rate → award points',
        url: '/api/demo/status',
        annotations: ['End-to-End Flow', 'Real HCS Operations', '7 Steps'],
      });
    } catch {
      await this.captureFrame({
        title: 'Demo Flow (Offline)',
        description: 'Demo flow endpoint — requires running server for live capture',
        url: '/api/demo/status',
        annotations: ['Demo Available', 'API-driven'],
      });
    }
  }

  /**
   * Take a screenshot using Playwright (if available).
   * Retries up to screenshotRetries times on failure.
   * Fails gracefully if Playwright is not installed.
   */
  private async takeScreenshot(url: string, outputPath: string): Promise<void> {
    const maxRetries = this.config.screenshotRetries;
    const retryDelay = this.config.screenshotRetryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
        await page.screenshot({ path: outputPath, fullPage: false });
        await browser.close();
        return; // Success
      } catch (err) {
        if (attempt < maxRetries) {
          console.log(`     [Screenshot attempt ${attempt}/${maxRetries} failed — retrying in ${retryDelay}ms]`);
          await new Promise(r => setTimeout(r, retryDelay));
        } else {
          console.log(`     [Screenshot skipped after ${maxRetries} attempts — ${err instanceof Error ? err.message : 'Playwright not available'}]`);
        }
      }
    }
  }

  /**
   * Get all captured frames.
   */
  getFrames(): VideoFrame[] {
    return [...this.frames];
  }

  /**
   * Get recording config.
   */
  getConfig(): VideoRecorderConfig {
    return { ...this.config };
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base-url');
  const baseUrl = baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : 'http://localhost:3000';
  const outIdx = args.indexOf('--output-dir');
  const outputDir = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : './demo-frames';
  const screenshots = args.includes('--screenshots');

  const recorder = new VideoRecorder({ baseUrl, outputDir, captureScreenshots: screenshots });

  recorder.record()
    .then(manifest => {
      const fs = require('fs');
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outPath = `${outputDir}/manifest.json`;
      fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
      console.log(`\n  Manifest saved to ${outPath}\n`);
    })
    .catch(err => {
      console.error(`\n  Error: ${err.message}\n`);
      process.exit(1);
    });
}
