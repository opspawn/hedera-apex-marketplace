/**
 * Demo Recorder — Runs the 7-step demo flow via API and captures
 * output in a clean, presentable format for submission materials.
 *
 * Usage:
 *   npx ts-node src/demo/recorder.ts [--base-url http://localhost:3000]
 *
 * Output: demo-recording.json with timestamped step data.
 */

const DEFAULT_BASE = 'http://localhost:3000';

interface RecordedStep {
  step: number;
  type: string;
  title: string;
  detail: string;
  timestamp: string;
  elapsed_ms: number;
  data?: Record<string, unknown>;
}

interface DemoRecording {
  recorded_at: string;
  base_url: string;
  total_steps: number;
  total_duration_ms: number;
  steps: RecordedStep[];
  summary: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
}

async function record(baseUrl: string): Promise<DemoRecording> {
  const startTime = Date.now();
  console.log(`\n  Hedera Agent Marketplace — Demo Recording`);
  console.log(`  ${'─'.repeat(46)}`);
  console.log(`  Target: ${baseUrl}\n`);

  // Check health first
  let health: Record<string, unknown> | null = null;
  try {
    const hRes = await fetch(`${baseUrl}/health`);
    health = await hRes.json() as Record<string, unknown>;
    console.log(`  Health: ${health.status} | v${health.version} | ${health.agents} agents | ${(health.standards as string[]).length} standards`);
  } catch {
    console.log('  Health check failed — is the server running?');
  }

  // Trigger demo
  console.log(`\n  Starting 7-step demo flow...\n`);
  const triggerRes = await fetch(`${baseUrl}/api/demo/run`, { method: 'POST' });
  const triggerData = await triggerRes.json() as Record<string, unknown>;

  if (triggerData.error) {
    throw new Error(`Demo trigger failed: ${triggerData.error}`);
  }

  // Poll until completed
  const steps: RecordedStep[] = [];
  let lastStepCount = 0;
  let finalState: Record<string, unknown> | null = null;

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));

    const pollRes = await fetch(`${baseUrl}/api/demo/status`);
    const state = await pollRes.json() as Record<string, unknown>;
    const stateSteps = (state.steps || []) as Array<Record<string, unknown>>;

    // Print new steps
    for (let j = lastStepCount; j < stateSteps.length; j++) {
      const s = stateSteps[j];
      const elapsed = Date.now() - startTime;
      const stepIcons: Record<string, string> = {
        seed: '🌱', search: '🔍', select: '🎯',
        hire: '💼', complete: '✅', rate: '⭐', points: '🏆',
      };
      const icon = stepIcons[s.type as string] || '📌';
      console.log(`  ${icon} Step ${s.step}: ${s.title}`);
      console.log(`     ${s.detail}`);
      console.log(`     [+${elapsed}ms]\n`);

      steps.push({
        step: s.step as number,
        type: s.type as string,
        title: s.title as string,
        detail: s.detail as string,
        timestamp: s.timestamp as string,
        elapsed_ms: elapsed,
        data: s.data as Record<string, unknown> | undefined,
      });
    }
    lastStepCount = stateSteps.length;

    if (state.status === 'completed' || state.status === 'failed') {
      finalState = state;
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  const summary = finalState?.summary as Record<string, unknown> | null || null;

  console.log(`  ${'─'.repeat(46)}`);
  if (finalState?.status === 'completed') {
    console.log(`  Demo completed in ${totalDuration}ms`);
    if (summary) {
      console.log(`  Agent: ${summary.selectedAgent}`);
      console.log(`  Points awarded: +${summary.pointsAwarded}`);
      console.log(`  Steps: ${summary.totalSteps}`);
    }
  } else {
    console.log(`  Demo failed: ${finalState?.error || 'timeout'}`);
  }

  return {
    recorded_at: new Date().toISOString(),
    base_url: baseUrl,
    total_steps: steps.length,
    total_duration_ms: totalDuration,
    steps,
    summary,
    health,
  };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base-url');
  const baseUrl = baseIdx >= 0 && args[baseIdx + 1] ? args[baseIdx + 1] : DEFAULT_BASE;

  record(baseUrl)
    .then(recording => {
      const fs = require('fs');
      const outPath = 'demo-recording.json';
      fs.writeFileSync(outPath, JSON.stringify(recording, null, 2));
      console.log(`\n  Recording saved to ${outPath}\n`);
    })
    .catch(err => {
      console.error(`\n  Error: ${err.message}\n`);
      process.exit(1);
    });
}

export { record, DemoRecording, RecordedStep };
