#!/usr/bin/env node
/**
 * Record all demo scenes using Playwright + ffmpeg screen capture on Xvfb :99
 *
 * Each scene: ffmpeg records for the FULL narration duration,
 * while Playwright drives UI actions in parallel.
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:4003';
const ASSETS_DIR = path.resolve(import.meta.dirname, '..', 'video-assets');
const DISPLAY = ':99';

// Narration durations (from ffprobe)
const NARRATION_DURATIONS = {
  '00-hook': 17.3,
  '01-dashboard': 26.1,
  '02-registration': 27.2,
  '03-discovery': 24.0,
  '04-profile': 24.0,
  '05-hire': 27.1,
  '06-rating': 22.1,
  '07-closing': 23.9,
};

const SCENES = [
  {
    id: '00-hook',
    title: 'Hook - Marketplace Landing',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
    }
  },
  {
    id: '01-dashboard',
    title: 'Dashboard Overview',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      // Show stats area
      await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
      // Show agents grid
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      // Show activity
      await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
    }
  },
  {
    id: '02-registration',
    title: 'Agent Registration',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const regTab = await page.$('[data-view="register"]');
      if (regTab) { await regTab.click(); await page.waitForTimeout(2000); }
      const nameField = await page.$('#reg-name');
      if (nameField) {
        await nameField.click();
        await page.waitForTimeout(500);
        await nameField.type('DeepAnalyzer', { delay: 100 });
        await page.waitForTimeout(1500);
      }
      const descField = await page.$('#reg-desc');
      if (descField) {
        await descField.click();
        await page.waitForTimeout(500);
        await descField.type('Advanced data analysis for financial markets', { delay: 60 });
        await page.waitForTimeout(2000);
      }
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
      await page.waitForTimeout(2000);
      const submitBtn = await page.$('#reg-submit, button[type="submit"]');
      if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(3000); }
    }
  },
  {
    id: '03-discovery',
    title: 'Agent Discovery',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const mktTab = await page.$('[data-view="marketplace"]');
      if (mktTab) { await mktTab.click(); await page.waitForTimeout(2000); }
      const searchField = await page.$('#search, input[placeholder*="Search"], input[type="search"]');
      if (searchField) {
        await searchField.click();
        await page.waitForTimeout(500);
        await searchField.type('security', { delay: 120 });
        await page.waitForTimeout(3000);
        await searchField.fill('');
        await page.waitForTimeout(1000);
        await searchField.type('data analysis', { delay: 80 });
        await page.waitForTimeout(3000);
      }
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
    }
  },
  {
    id: '04-profile',
    title: 'Agent Profile',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const mktTab = await page.$('[data-view="marketplace"]');
      if (mktTab) { await mktTab.click(); await page.waitForTimeout(2000); }
      const agentCard = await page.$('.agent-card');
      if (agentCard) { await agentCard.click(); await page.waitForTimeout(3000); }
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
    }
  },
  {
    id: '05-hire',
    title: 'Hire Agent Flow',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const mktTab = await page.$('[data-view="marketplace"]');
      if (mktTab) { await mktTab.click(); await page.waitForTimeout(2000); }
      // Correct selector: "btn btn-hire"
      const hireBtn = await page.$('.btn-hire, .btn.btn-hire');
      if (hireBtn) {
        await hireBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      // Fill hire modal fields
      const clientField = await page.$('#hire-client');
      if (clientField) {
        await clientField.click();
        await clientField.type('0.0.demo-client', { delay: 60 });
        await page.waitForTimeout(1000);
      }
      const inputField = await page.$('#hire-input');
      if (inputField) {
        await inputField.click();
        await inputField.type('Audit smart contract for vulnerabilities', { delay: 50 });
        await page.waitForTimeout(2000);
      }
      const submitHire = await page.$('#hire-submit, .modal button[type="submit"], .hire-form button');
      if (submitHire) { await submitHire.click({ timeout: 5000 }).catch(() => {}); }
      await page.waitForTimeout(4000);
    }
  },
  {
    id: '06-rating',
    title: 'Rating & Reputation',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      // Click Demo/Activity tab
      const demoTab = await page.$('[data-view="demo"], [data-view="activity"]');
      if (demoTab) { await demoTab.click(); await page.waitForTimeout(2000); }
      // Trigger demo run
      try {
        await page.evaluate(async () => {
          const resp = await fetch('/api/demo/run', { method: 'POST' });
          return resp.json();
        });
      } catch {}
      await page.waitForTimeout(5000);
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
    }
  },
  {
    id: '07-closing',
    title: 'HOL Registry & Closing',
    actions: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const regTab = await page.$('[data-view="registry"], [data-view="hol-status"]');
      if (regTab) { await regTab.click(); await page.waitForTimeout(4000); }
      const dashTab = await page.$('[data-view="marketplace"]');
      if (dashTab) { await dashTab.click(); await page.waitForTimeout(3000); }
      await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(3000);
    }
  },
];

async function recordScene(scene, browser) {
  const duration = NARRATION_DURATIONS[scene.id] + 1; // +1s padding
  const outputFile = path.join(ASSETS_DIR, `scene-${scene.id}-raw.mp4`);
  console.log(`\n=== Recording Scene ${scene.id}: ${scene.title} (${duration.toFixed(1)}s) ===`);

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Start ffmpeg for the exact narration duration
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-video_size', '1920x1080',
    '-framerate', '30',
    '-f', 'x11grab',
    '-i', `${DISPLAY}.0`,
    '-t', String(Math.ceil(duration)),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-crf', '23',
    outputFile
  ], {
    env: { ...process.env, DISPLAY },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let ffmpegErr = '';
  ffmpeg.stderr.on('data', (d) => { ffmpegErr += d.toString(); });

  // Wait for ffmpeg to start
  await new Promise(r => setTimeout(r, 800));

  // Run Playwright actions (don't await the full duration — just the actions)
  const actionPromise = scene.actions(page).catch(err => {
    console.error(`  Action error in ${scene.id}:`, err.message);
  });

  // Wait for ffmpeg to complete (it has a -t duration limit)
  await new Promise((resolve) => {
    ffmpeg.on('close', resolve);
  });

  // If actions are still running, give them a moment then close
  await Promise.race([actionPromise, new Promise(r => setTimeout(r, 2000))]);

  await page.close();

  if (existsSync(outputFile)) {
    const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputFile}"`).toString().trim();
    console.log(`  ✓ Recorded: ${path.basename(outputFile)} (${probe}s)`);
    return outputFile;
  } else {
    console.error(`  ✗ Failed: ${outputFile}`);
    return null;
  }
}

async function main() {
  console.log('Hedera Agent Marketplace — Demo Video Recording v2');
  console.log('===================================================');

  // Verify server
  try {
    execSync(`curl -sf ${BASE_URL}/api/health`, { timeout: 5000 });
    console.log('✓ Server healthy');
  } catch {
    console.error('✗ Server not responding'); process.exit(1);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080', '--start-maximized', '--force-device-scale-factor=1'],
    env: { ...process.env, DISPLAY },
  });

  console.log('✓ Browser launched on', DISPLAY);

  const recordedFiles = [];
  for (const scene of SCENES) {
    const file = await recordScene(scene, browser);
    if (file) recordedFiles.push(file);
  }

  await browser.close();

  console.log('\n=== Recording Complete ===');
  console.log(`Recorded ${recordedFiles.length}/${SCENES.length} scenes`);
  recordedFiles.forEach(f => console.log(`  ${path.basename(f)}`));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
