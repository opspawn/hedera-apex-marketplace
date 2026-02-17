/**
 * Dashboard — Serves the web UI for the Hedera Agent Marketplace.
 *
 * Full-featured dashboard with:
 * - Agent Registry View (HCS-19 identity, DID, verification, HCS-26 skills)
 * - Marketplace View (search/filter, hire flow)
 * - Activity Feed (recent events)
 * - Stats Panel (totals)
 */

import { Router, Request, Response } from 'express';
import { RecordingPipeline } from '../demo/recording-pipeline';
import { buildNarrationScript } from '../demo/narration-script';
import { getTransitionsInOrder, validateTransitions } from '../demo/scene-transitions';

export function createDashboardRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDashboardHTML());
  });

  // Demo page — standalone HTML for video capture
  router.get('/demo', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDemoPageHTML());
  });

  // Demo walkthrough — scene-by-scene breakdown with captions for video pipeline
  router.get('/demo/walkthrough', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDemoWalkthroughHTML());
  });

  // Demo narration script endpoint
  router.get('/demo/narration', (_req: Request, res: Response) => {
    const script = buildNarrationScript();
    res.json(script);
  });

  // Demo transitions endpoint
  router.get('/demo/transitions', (_req: Request, res: Response) => {
    const transitions = getTransitionsInOrder();
    const validation = validateTransitions();
    res.json({ transitions, validation });
  });

  // POST /demo/record — Orchestrate full recording pipeline
  let activePipeline: RecordingPipeline | null = null;

  router.post('/demo/record', async (req: Request, res: Response) => {
    if (activePipeline && activePipeline.getStatus() !== 'idle'
        && activePipeline.getStatus() !== 'completed'
        && activePipeline.getStatus() !== 'failed') {
      res.json({
        status: activePipeline.getStatus(),
        message: 'Recording pipeline already running',
        poll_url: '/demo/record/status',
      });
      return;
    }

    const baseUrl = (req.body?.baseUrl as string) || `http://localhost:${req.socket.localPort || 3000}`;
    const captureScreenshots = req.body?.captureScreenshots === true;
    const outputDir = (req.body?.outputDir as string) || './demo-video';

    activePipeline = new RecordingPipeline({
      baseUrl,
      outputDir,
      captureScreenshots,
    });

    // Run async — don't block the response
    activePipeline.run().catch(() => {});
    await new Promise(r => setTimeout(r, 100));

    res.json({
      status: activePipeline.getStatus(),
      message: 'Recording pipeline started',
      poll_url: '/demo/record/status',
    });
  });

  // GET /demo/record/status — Poll recording pipeline status
  router.get('/demo/record/status', (_req: Request, res: Response) => {
    if (!activePipeline) {
      res.json({ status: 'idle', message: 'No recording in progress. POST /demo/record to start.' });
      return;
    }
    const result = activePipeline.getResult();
    if (result) {
      res.json(result);
    } else {
      res.json({
        status: activePipeline.getStatus(),
        message: 'Recording in progress...',
      });
    }
  });

  // Demo flow dashboard — interactive end-to-end demo runner
  router.get('/demo-flow', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getDemoFlowHTML());
  });

  // Marketplace stats endpoint for the dashboard
  router.get('/api/dashboard/stats', async (_req: Request, res: Response) => {
    res.json({
      timestamp: new Date().toISOString(),
      protocols: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
    });
  });

  return router;
}

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hedera Agent Marketplace</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080c14; color: #e0e0e0; min-height: 100vh; }

    /* Animations */
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes successPop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    /* Header */
    .header { background: linear-gradient(135deg, #0d1528 0%, #131b30 50%, #0f1a2e 100%); padding: 1.5rem 2rem; border-bottom: 1px solid #1e2a4a; display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 1rem; }
    .logo { width: 40px; height: 40px; background: linear-gradient(135deg, #00d4ff, #0088cc); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; color: #fff; }
    .header h1 { font-size: 1.4rem; color: #fff; font-weight: 600; }
    .header h1 span { color: #00d4ff; }
    .header-right { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .header-badge { padding: 0.35rem 0.75rem; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 6px; font-size: 0.75rem; color: #00d4ff; transition: background 0.2s; }
    .header-badge:hover { background: rgba(0, 212, 255, 0.2); }

    /* Navigation */
    .nav { display: flex; gap: 0; background: #0d1528; border-bottom: 1px solid #1e2a4a; padding: 0 2rem; }
    .nav-tab { padding: 0.85rem 1.5rem; cursor: pointer; color: #6a7a9a; font-size: 0.9rem; border-bottom: 2px solid transparent; transition: all 0.25s ease; user-select: none; }
    .nav-tab:hover { color: #a0b0d0; background: rgba(0, 212, 255, 0.03); }
    .nav-tab:focus-visible { outline: 2px solid #00d4ff; outline-offset: -2px; }
    .nav-tab.active { color: #00d4ff; border-bottom-color: #00d4ff; }

    /* Layout */
    .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem; }
    .view { display: none; }
    .view.active { display: block; animation: fadeIn 0.3s ease; }

    /* Stats Panel */
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card { background: linear-gradient(135deg, #111827 0%, #0f1520 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #1e2a4a; transition: border-color 0.25s, transform 0.25s; position: relative; overflow: hidden; }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 12px 12px 0 0; }
    .stat-card:nth-child(1)::before { background: linear-gradient(90deg, #00d4ff, #0088cc); }
    .stat-card:nth-child(2)::before { background: linear-gradient(90deg, #a855f7, #7c3aed); }
    .stat-card:nth-child(3)::before { background: linear-gradient(90deg, #00c853, #00a040); }
    .stat-card:nth-child(4)::before { background: linear-gradient(90deg, #ffaa00, #ff8800); }
    .stat-card:hover { border-color: rgba(0, 212, 255, 0.3); transform: translateY(-2px); }
    .stat-card .value { font-size: 30px; color: #00d4ff; font-weight: 800; line-height: 1.2; transition: color 0.3s; }
    .stat-card:nth-child(2) .value { color: #a855f7; }
    .stat-card:nth-child(3) .value { color: #00c853; }
    .stat-card:nth-child(4) .value { color: #ffaa00; }
    .stat-card .value.updated { animation: countUp 0.4s ease; }
    .stat-card .label { color: #6a7a9a; font-size: 0.8rem; margin-top: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .change { font-size: 0.75rem; color: #00c853; margin-top: 0.35rem; }
    .stat-card .stat-icon { font-size: 1.5rem; position: absolute; top: 1rem; right: 1rem; opacity: 0.3; }

    /* Search/Filter Bar */
    .toolbar { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center; }
    .search-input { flex: 1; min-width: 250px; padding: 0.7rem 1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 8px; color: #e0e0e0; font-size: 0.9rem; transition: border-color 0.2s, box-shadow 0.2s; }
    .search-input:focus { outline: none; border-color: #00d4ff; box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1); }
    .filter-select { padding: 0.7rem 1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 8px; color: #e0e0e0; font-size: 0.9rem; cursor: pointer; transition: border-color 0.2s; }
    .filter-select:focus { outline: none; border-color: #00d4ff; }
    .category-chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .category-chip { padding: 0.4rem 0.9rem; border-radius: 20px; border: 1px solid #1e2a4a; background: #111827; color: #6a7a9a; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; user-select: none; }
    .category-chip:hover { border-color: #00d4ff; color: #00d4ff; background: rgba(0, 212, 255, 0.05); }
    .category-chip.active { background: rgba(0, 212, 255, 0.15); border-color: #00d4ff; color: #00d4ff; font-weight: 500; }
    .btn { padding: 0.7rem 1.25rem; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; position: relative; }
    .btn:focus-visible { outline: 2px solid #00d4ff; outline-offset: 2px; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary { background: linear-gradient(135deg, #0088cc, #00aaff); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #0077b3, #0099ee); transform: translateY(-1px); }
    .btn-secondary { background: #1e2a4a; color: #a0b0d0; border: 1px solid #2a3a5a; }
    .btn-secondary:hover:not(:disabled) { background: #2a3a5a; }
    .btn-hire { background: linear-gradient(135deg, #00c853, #00a040); color: #fff; font-size: 0.8rem; padding: 0.5rem 1rem; }
    .btn-hire:hover:not(:disabled) { background: linear-gradient(135deg, #00a040, #008830); transform: translateY(-1px); }

    /* Agent Cards */
    .agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem; }
    .agent-card { background: #111827; border-radius: 12px; padding: 1.5rem; border: 1px solid #1e2a4a; transition: all 0.25s ease; animation: fadeInUp 0.4s ease backwards; cursor: pointer; }
    .agent-card:nth-child(1) { animation-delay: 0.05s; }
    .agent-card:nth-child(2) { animation-delay: 0.1s; }
    .agent-card:nth-child(3) { animation-delay: 0.15s; }
    .agent-card:nth-child(4) { animation-delay: 0.2s; }
    .agent-card:nth-child(5) { animation-delay: 0.25s; }
    .agent-card:nth-child(6) { animation-delay: 0.3s; }
    .agent-card:hover { border-color: #00d4ff; transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0, 212, 255, 0.1); }
    .agent-card:focus-visible { outline: 2px solid #00d4ff; outline-offset: 2px; }
    .agent-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
    .agent-avatar { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(168, 85, 247, 0.15)); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-right: 0.75rem; flex-shrink: 0; border: 1px solid rgba(0, 212, 255, 0.2); }
    .agent-name-group { display: flex; align-items: center; }
    .agent-name { font-size: 1.1rem; font-weight: 600; color: #fff; }
    .agent-desc { color: #8892b0; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .agent-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; align-items: center; }
    .badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; }
    .badge-verified { background: rgba(0, 200, 83, 0.15); color: #00c853; border: 1px solid rgba(0, 200, 83, 0.3); }
    .badge-unverified { background: rgba(255, 170, 0, 0.15); color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.3); }
    .badge-revoked { background: rgba(255, 68, 68, 0.15); color: #ff4444; border: 1px solid rgba(255, 68, 68, 0.3); }
    .badge-online { background: rgba(0, 200, 83, 0.15); color: #00c853; }
    .badge-offline { background: rgba(255, 68, 68, 0.15); color: #ff4444; }
    .skill-tag { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.72rem; font-weight: 500; margin: 0.15rem; transition: all 0.2s; cursor: default; }
    .skill-tag:hover { transform: translateY(-1px); filter: brightness(1.2); }
    .skill-tag-0 { background: rgba(0, 136, 204, 0.15); color: #00aaff; border: 1px solid rgba(0, 136, 204, 0.25); }
    .skill-tag-1 { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }
    .skill-tag-2 { background: rgba(0, 200, 83, 0.15); color: #34d399; border: 1px solid rgba(0, 200, 83, 0.25); }
    .skill-tag-3 { background: rgba(255, 170, 0, 0.15); color: #fbbf24; border: 1px solid rgba(255, 170, 0, 0.25); }
    .skill-tag-4 { background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.25); }
    .skill-tag-5 { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); }
    .agent-identity { font-size: 0.75rem; color: #4a5a7a; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #1e2a4a; }
    .agent-identity code { background: #0d1528; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; color: #6a8ab0; }
    .agent-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .agent-reputation { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; color: #ffaa00; }

    /* Activity Feed */
    .feed { max-width: 800px; }
    .feed-item { display: flex; gap: 1rem; padding: 1rem 1.25rem; background: #111827; border-radius: 10px; border: 1px solid #1e2a4a; margin-bottom: 0.75rem; animation: fadeInUp 0.3s ease backwards; transition: all 0.25s; cursor: default; }
    .feed-item:hover { border-color: rgba(0, 212, 255, 0.3); background: #131d2f; transform: translateX(4px); }
    .feed-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
    .feed-icon.register { background: rgba(0, 212, 255, 0.15); color: #00d4ff; }
    .feed-icon.skill { background: rgba(138, 43, 226, 0.15); color: #a855f7; }
    .feed-icon.hire { background: rgba(0, 200, 83, 0.15); color: #00c853; }
    .feed-content { flex: 1; }
    .feed-title { font-size: 0.9rem; color: #e0e0e0; display: flex; align-items: center; gap: 0.5rem; }
    .feed-title strong { color: #00d4ff; }
    .feed-type-pill { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .feed-type-pill.register { background: rgba(0, 212, 255, 0.12); color: #00d4ff; }
    .feed-type-pill.skill { background: rgba(168, 85, 247, 0.12); color: #a855f7; }
    .feed-type-pill.hire { background: rgba(0, 200, 83, 0.12); color: #00c853; }
    .feed-time { font-size: 0.7rem; color: #4a5a7a; margin-top: 0.35rem; display: inline-block; background: #0d1528; padding: 0.15rem 0.5rem; border-radius: 8px; }
    .feed-empty { text-align: center; padding: 3rem; color: #4a5a7a; }

    /* Agent Detail Modal */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); z-index: 100; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .modal-overlay.active { display: flex; animation: fadeIn 0.2s ease; }
    .modal { background: #111827; border-radius: 16px; border: 1px solid #1e2a4a; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 2rem; animation: scaleIn 0.25s ease; }
    .modal h2 { color: #fff; margin-bottom: 1rem; }
    .modal-close { float: right; background: none; border: none; color: #6a7a9a; font-size: 1.5rem; cursor: pointer; transition: color 0.2s; }
    .modal-close:hover { color: #fff; }
    .modal-close:focus-visible { outline: 2px solid #00d4ff; border-radius: 4px; }
    .modal-section { margin-bottom: 1.25rem; }
    .modal-section h3 { color: #00d4ff; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .modal-field { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #1a2240; font-size: 0.85rem; }
    .modal-field .label { color: #6a7a9a; }
    .modal-field .value { color: #e0e0e0; word-break: break-all; }

    /* Hire Form */
    .hire-form { background: #0d1528; padding: 1.25rem; border-radius: 10px; border: 1px solid #1e2a4a; margin-top: 1rem; }
    .hire-form label { display: block; color: #6a7a9a; font-size: 0.8rem; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .hire-form input, .hire-form select, .hire-form textarea { width: 100%; padding: 0.6rem 0.8rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 6px; color: #e0e0e0; font-size: 0.85rem; margin-bottom: 0.75rem; transition: border-color 0.2s; }
    .hire-form input:focus, .hire-form select:focus, .hire-form textarea:focus { outline: none; border-color: #00d4ff; }
    .hire-result { margin-top: 1rem; padding: 1rem; border-radius: 8px; font-size: 0.85rem; animation: slideDown 0.3s ease; }
    .hire-result.success { background: rgba(0, 200, 83, 0.1); border: 1px solid rgba(0, 200, 83, 0.3); color: #00c853; }
    .hire-result.error { background: rgba(255, 68, 68, 0.1); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff4444; }

    /* Register Form */
    .register-panel { max-width: 600px; }
    .register-panel .form-group { margin-bottom: 1rem; }
    .register-panel label { display: block; color: #6a7a9a; font-size: 0.8rem; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .register-panel input, .register-panel textarea { width: 100%; padding: 0.7rem 1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 8px; color: #e0e0e0; font-size: 0.9rem; transition: border-color 0.2s, box-shadow 0.2s; }
    .register-panel input:focus, .register-panel textarea:focus { outline: none; border-color: #00d4ff; box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15), 0 0 20px rgba(0, 212, 255, 0.08); }
    .register-panel input.invalid, .register-panel textarea.invalid { border-color: #ff4444; box-shadow: 0 0 0 3px rgba(255, 68, 68, 0.1); }
    .register-panel input.valid, .register-panel textarea.valid { border-color: #00c853; box-shadow: 0 0 0 3px rgba(0, 200, 83, 0.1); }
    .register-result { margin-top: 1rem; padding: 1rem; border-radius: 8px; font-size: 0.85rem; }
    .field-hint { font-size: 0.7rem; color: #4a5a7a; margin-top: -0.75rem; margin-bottom: 0.75rem; }
    .field-error { font-size: 0.7rem; color: #ff4444; margin-top: -0.75rem; margin-bottom: 0.75rem; display: none; }
    .field-error.visible { display: block; animation: slideDown 0.2s ease; }
    .register-progress { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
    .register-step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
    .register-step .step-bar { width: 100%; height: 4px; border-radius: 2px; background: #1e2a4a; transition: background 0.3s; }
    .register-step .step-label { font-size: 0.65rem; color: #4a5a7a; text-transform: uppercase; letter-spacing: 0.04em; transition: color 0.3s; }
    .register-step.filled .step-bar { background: linear-gradient(90deg, #00d4ff, #00aaff); }
    .register-step.filled .step-label { color: #00d4ff; }
    .register-step.active .step-bar { background: linear-gradient(90deg, #00d4ff, #00aaff); animation: pulse 1.5s infinite; }
    .register-step.active .step-label { color: #00d4ff; }

    /* Skeleton Loading */
    .skeleton { background: linear-gradient(90deg, #111827 25%, #1a2540 50%, #111827 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; }
    .skeleton-card { height: 200px; border-radius: 12px; border: 1px solid #1e2a4a; }
    .skeleton-line { height: 14px; margin-bottom: 8px; border-radius: 4px; }
    .skeleton-line.short { width: 60%; }
    .skeleton-line.medium { width: 80%; }
    .skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem; }

    /* Error State */
    .error-state { text-align: center; padding: 3rem 2rem; animation: fadeIn 0.3s ease; }
    .error-state .error-icon { font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.7; }
    .error-state .error-msg { color: #8892b0; font-size: 0.95rem; margin-bottom: 1rem; }
    .error-state .btn { margin-top: 0.5rem; }

    /* Loading / Empty */
    .loading { text-align: center; padding: 3rem; color: #4a5a7a; }
    .loading-spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #1e2a4a; border-top-color: #00d4ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 0.5rem; vertical-align: middle; }
    .empty-state { text-align: center; padding: 4rem 2rem; color: #4a5a7a; animation: fadeIn 0.3s ease; }
    .empty-state .icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
    .empty-state p { font-size: 0.95rem; }

    /* Toast notifications */
    .toast-container { position: fixed; top: 1rem; right: 1rem; z-index: 200; display: flex; flex-direction: column; gap: 0.5rem; }
    .toast { padding: 0.75rem 1.25rem; border-radius: 10px; font-size: 0.85rem; animation: slideDown 0.3s ease; max-width: 400px; display: flex; align-items: center; gap: 0.5rem; }
    .toast-success { background: rgba(0, 200, 83, 0.15); border: 1px solid rgba(0, 200, 83, 0.3); color: #00c853; }
    .toast-error { background: rgba(255, 68, 68, 0.15); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff4444; }
    .toast-info { background: rgba(0, 212, 255, 0.15); border: 1px solid rgba(0, 212, 255, 0.3); color: #00d4ff; }

    /* Footer */
    .footer { text-align: center; padding: 2rem; color: #3a4a6a; font-size: 0.8rem; border-top: 1px solid #1a2240; margin-top: 3rem; }
    .footer a { color: #00aaff; text-decoration: none; }

    /* Success animation overlay */
    .success-overlay { animation: successPop 0.4s ease; }

    /* Responsive — tablet */
    @media (max-width: 1024px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .agents-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
      .container { padding: 1.25rem 1.5rem; }
    }

    /* Responsive — mobile */
    @media (max-width: 768px) {
      .stats { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
      .stat-card { padding: 1rem; }
      .stat-card .value { font-size: 1.5rem; }
      .agents-grid { grid-template-columns: 1fr; }
      .toolbar { flex-direction: column; }
      .search-input { min-width: unset; }
      .header { flex-direction: column; gap: 0.75rem; text-align: center; padding: 1rem 1.25rem; }
      .header-right { justify-content: center; }
      .nav { overflow-x: auto; padding: 0 1rem; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .nav::-webkit-scrollbar { display: none; }
      .nav-tab { padding: 0.75rem 1rem; font-size: 0.85rem; white-space: nowrap; }
      .container { padding: 1rem; }
      .modal { width: 95%; max-height: 90vh; padding: 1.5rem; }
      .register-panel { max-width: 100%; }
      .feed { max-width: 100%; }
      .agent-actions { flex-wrap: wrap; }
    }

    /* Responsive — small mobile */
    @media (max-width: 480px) {
      .stats { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .stat-card .value { font-size: 1.25rem; }
      .header h1 { font-size: 1.2rem; }
      .header-badge { font-size: 0.65rem; padding: 0.25rem 0.5rem; }
    }

    /* Accessibility */
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
    :focus-visible { outline: 2px solid #00d4ff; outline-offset: 2px; }
  </style>
</head>
<body>

  <!-- Toast Container -->
  <div class="toast-container" id="toast-container" aria-live="polite" aria-label="Notifications"></div>

  <!-- Header -->
  <header class="header" role="banner">
    <div class="header-left">
      <div class="logo" aria-hidden="true">H</div>
      <div>
        <h1><span>Hedera</span> Agent Marketplace</h1>
        <div style="font-size:0.7rem; color:#6a7a9a; margin-top:0.15rem;">v0.24.0 &middot; <span id="testnet-mode" style="color:#00c853;">Testnet</span> &middot; Account <span style="color:#00d4ff;">0.0.7854018</span></div>
      </div>
    </div>
    <div class="header-right" aria-label="Supported HCS Standards">
      <span class="header-badge">HCS-10</span>
      <span class="header-badge">HCS-11</span>
      <span class="header-badge">HCS-14</span>
      <span class="header-badge">HCS-19</span>
      <span class="header-badge">HCS-20</span>
      <span class="header-badge">HCS-26</span>
    </div>
  </header>

  <!-- Testnet Status Banner -->
  <div id="testnet-banner" style="background:linear-gradient(90deg, rgba(0,200,83,0.08) 0%, rgba(0,212,255,0.08) 100%); padding:0.5rem 2rem; border-bottom:1px solid rgba(0,200,83,0.2); display:flex; align-items:center; justify-content:space-between; font-size:0.78rem;">
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <span id="testnet-dot" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#00c853; animation:pulse 2s infinite;"></span>
      <span style="color:#e0e0e0;">Live Hedera Testnet</span>
      <span style="color:#6a7a9a;">&middot;</span>
      <span style="color:#00d4ff;" id="testnet-topics">0 topics</span>
      <span style="color:#6a7a9a;">&middot;</span>
      <span style="color:#a855f7;" id="testnet-messages">0 messages</span>
    </div>
    <span style="color:#6a7a9a;" id="testnet-info">Loading...</span>
  </div>

  <!-- Navigation -->
  <nav class="nav" id="nav" role="tablist" aria-label="Dashboard Navigation">
    <div class="nav-tab active" data-view="marketplace" role="tab" tabindex="0" aria-selected="true" aria-controls="view-marketplace">Marketplace</div>
    <div class="nav-tab" data-view="registry" role="tab" tabindex="0" aria-selected="false" aria-controls="view-registry">Agent Registry</div>
    <div class="nav-tab" data-view="activity" role="tab" tabindex="0" aria-selected="false" aria-controls="view-activity">Activity Feed</div>
    <div class="nav-tab" data-view="register" role="tab" tabindex="0" aria-selected="false" aria-controls="view-register">Register Agent</div>
    <div class="nav-tab" data-view="hol-status" role="tab" tabindex="0" aria-selected="false" aria-controls="view-hol-status" style="color:#a855f7;">HOL Registry</div>
    <div class="nav-tab" data-view="connections" role="tab" tabindex="0" aria-selected="false" aria-controls="view-connections" style="color:#f59e0b;">Connections</div>
    <div class="nav-tab" data-view="demo" role="tab" tabindex="0" aria-selected="false" aria-controls="view-demo" style="color:#00c853;">Live Demo</div>
    <a href="/chat" class="nav-tab" style="color:#00d4ff; text-decoration:none;" title="Chat with Hedera Agent">&#x1F4AC; Agent Chat</a>
  </nav>

  <div class="container">

    <!-- Stats Panel -->
    <div class="stats" id="stats" role="region" aria-label="Marketplace Statistics">
      <div class="stat-card">
        <span class="stat-icon">&#x1F916;</span>
        <div class="value" id="stat-agents" aria-label="Registered Agents count">0</div>
        <div class="label">Registered Agents</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#x1F9E9;</span>
        <div class="value" id="stat-skills" aria-label="Published Skills count">0</div>
        <div class="label">Published Skills</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#x2705;</span>
        <div class="value" id="stat-hires" aria-label="Total Hires count">0</div>
        <div class="label">Total Hires</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">&#x1F4C8;</span>
        <div class="value" id="stat-active" aria-label="Active Listings count">0</div>
        <div class="label">Active Listings</div>
      </div>
    </div>

    <!-- Marketplace View -->
    <div class="view active" id="view-marketplace" role="tabpanel" aria-labelledby="tab-marketplace">
      <div class="toolbar" role="search" aria-label="Search agents">
        <label for="search" class="sr-only">Search agents</label>
        <input type="text" class="search-input" id="search" placeholder="Search agents by name, skill, or tag..." aria-label="Search agents by name, skill, or tag" />
        <label for="filter-category" class="sr-only">Filter by category</label>
        <select class="filter-select" id="filter-category" aria-label="Filter by category" style="display:none;">
          <option value="">All Categories</option>
          <option value="nlp">NLP</option>
          <option value="analytics">Analytics</option>
          <option value="automation">Automation</option>
          <option value="blockchain">Blockchain</option>
          <option value="ai">AI / ML</option>
        </select>
        <label for="filter-status" class="sr-only">Filter by status</label>
        <select class="filter-select" id="filter-status" aria-label="Filter by status" style="display:none;">
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
        <button class="btn btn-primary" onclick="searchMarketplace()" aria-label="Search marketplace">Search</button>
      </div>
      <div class="category-chips" id="category-chips" role="group" aria-label="Category filters">
        <span class="category-chip active" data-category="" onclick="filterByCategory(this)">All</span>
        <span class="category-chip" data-category="nlp" onclick="filterByCategory(this)">NLP</span>
        <span class="category-chip" data-category="analytics" onclick="filterByCategory(this)">Analytics</span>
        <span class="category-chip" data-category="automation" onclick="filterByCategory(this)">Automation</span>
        <span class="category-chip" data-category="blockchain" onclick="filterByCategory(this)">Blockchain</span>
        <span class="category-chip" data-category="ai" onclick="filterByCategory(this)">AI / ML</span>
        <span class="category-chip" data-category="security" onclick="filterByCategory(this)">Security</span>
      </div>
      <div class="agents-grid" id="marketplace-agents" aria-live="polite">
        <div class="skeleton-grid" id="marketplace-skeleton">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    </div>

    <!-- Registry View -->
    <div class="view" id="view-registry" role="tabpanel" aria-labelledby="tab-registry">
      <div class="toolbar" role="search" aria-label="Search agent registry">
        <label for="registry-search" class="sr-only">Search registry</label>
        <input type="text" class="search-input" id="registry-search" placeholder="Search registry by agent ID or name..." aria-label="Search registry by agent ID or name" />
        <button class="btn btn-primary" onclick="searchRegistry()" aria-label="Search registry">Search</button>
      </div>
      <div class="agents-grid" id="registry-agents" aria-live="polite">
        <div class="skeleton-grid">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    </div>

    <!-- Activity Feed -->
    <div class="view" id="view-activity" role="tabpanel" aria-labelledby="tab-activity">
      <div class="feed" id="activity-feed" role="log" aria-label="Activity Feed" aria-live="polite">
        <div class="feed-empty">No recent activity</div>
      </div>
    </div>

    <!-- HOL Registry Status -->
    <div class="view" id="view-hol-status" role="tabpanel" aria-labelledby="tab-hol-status">
      <h2 style="color:#fff; margin-bottom:0.5rem;">HOL Registry & Connections</h2>
      <p style="color:#6a7a9a; margin-bottom:1.5rem; font-size:0.9rem;">Registry Broker status, HCS-10 connection listener, and active agent connections.</p>

      <div class="stats" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card">
          <div class="stat-icon">&#x1F310;</div>
          <div class="value" id="hol-broker-status">--</div>
          <div class="label">Registry Broker</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#x1F50C;</div>
          <div class="value" id="hol-connection-status">--</div>
          <div class="label">Connection Listener</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">&#x1F4AC;</div>
          <div class="value" id="hol-active-connections">0</div>
          <div class="label">Active Connections</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; margin-top:1rem;">
        <div style="background:#111827; border-radius:12px; padding:1.5rem; border:1px solid #1e2a4a;">
          <h3 style="color:#a855f7; margin-bottom:1rem; font-size:1rem;">Registry Broker</h3>
          <div id="hol-broker-details" style="font-size:0.85rem; color:#8892b0;">
            <div style="margin-bottom:0.5rem;">Broker URL: <span style="color:#00d4ff;">https://hol.org/registry/api/v1</span></div>
            <div style="margin-bottom:0.5rem;">UAID: <span id="hol-uaid" style="color:#e0e0e0;">Not registered</span></div>
            <div style="margin-bottom:0.5rem;">Protocol: <span style="color:#00c853;">HCS-10</span></div>
            <div style="margin-bottom:1rem;">Last Check: <span id="hol-last-check" style="color:#e0e0e0;">--</span></div>
            <button class="btn btn-primary" onclick="triggerHolRegistration()" id="hol-register-btn">Register with HOL</button>
          </div>
        </div>
        <div style="background:#111827; border-radius:12px; padding:1.5rem; border:1px solid #1e2a4a;">
          <h3 style="color:#00d4ff; margin-bottom:1rem; font-size:1rem;">HCS-10 Connections</h3>
          <div id="hol-connections-list" style="font-size:0.85rem; color:#8892b0;">
            <div style="margin-bottom:0.5rem;">Inbound Topic: <span style="color:#00d4ff;">0.0.7854276</span></div>
            <div style="margin-bottom:0.5rem;">Pending Requests: <span id="hol-pending" style="color:#ffaa00;">0</span></div>
            <div id="hol-connections-detail" style="margin-top:1rem;">No active connections</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Register Agent View -->
    <div class="view" id="view-register" role="tabpanel" aria-labelledby="tab-register">
      <div class="register-panel">
        <h2 style="color:#fff; margin-bottom:0.5rem;">Register New Agent</h2>
        <p style="color:#6a7a9a; margin-bottom:1rem; font-size:0.9rem;">Register your agent on the Hedera Agent Marketplace with full HCS identity, profile, and skill publishing.</p>
        <div class="register-progress" aria-label="Registration form progress">
          <div class="register-step" id="reg-step-1"><div class="step-bar"></div><span class="step-label">Identity</span></div>
          <div class="register-step" id="reg-step-2"><div class="step-bar"></div><span class="step-label">Details</span></div>
          <div class="register-step" id="reg-step-3"><div class="step-bar"></div><span class="step-label">Skills</span></div>
        </div>
        <form id="register-form" onsubmit="event.preventDefault(); registerAgent();" novalidate>
          <div class="form-group">
            <label for="reg-name">Agent Name <span style="color:#ff4444">*</span></label>
            <input type="text" id="reg-name" placeholder="My AI Agent" required aria-required="true" oninput="validateField(this, 'name')" />
            <div class="field-error" id="err-name">Agent name is required (2+ characters)</div>
          </div>
          <div class="form-group">
            <label for="reg-description">Description <span style="color:#ff4444">*</span></label>
            <textarea id="reg-description" rows="3" placeholder="Describe what your agent does..." required aria-required="true" oninput="validateField(this, 'description')"></textarea>
            <div class="field-error" id="err-description">Description is required (10+ characters)</div>
          </div>
          <div class="form-group">
            <label for="reg-endpoint">Endpoint URL <span style="color:#ff4444">*</span></label>
            <input type="url" id="reg-endpoint" placeholder="https://my-agent.example.com/a2a" required aria-required="true" oninput="validateField(this, 'endpoint')" />
            <div class="field-error" id="err-endpoint">Valid URL is required (must start with http:// or https://)</div>
            <div class="field-hint">The A2A endpoint where your agent receives tasks</div>
          </div>
          <div class="form-group">
            <label for="reg-skill-name">Skill Name</label>
            <input type="text" id="reg-skill-name" placeholder="e.g. Translation" oninput="validateField(this, 'skill')" />
            <div class="field-hint">Primary skill your agent provides (defaults to "Default Skill")</div>
          </div>
          <div class="form-group">
            <label for="reg-skill-category">Skill Category</label>
            <input type="text" id="reg-skill-category" placeholder="e.g. nlp, analytics, automation" />
          </div>
          <div class="form-group">
            <label for="reg-payment">Payment Address</label>
            <input type="text" id="reg-payment" placeholder="0.0.12345" />
            <div class="field-hint">Your Hedera account ID for receiving payments</div>
          </div>
          <button type="submit" class="btn btn-primary" id="reg-submit-btn" style="width:100%">Register Agent</button>
        </form>
        <div id="register-result" aria-live="polite"></div>
      </div>
    </div>
    <!-- Connections View -->
    <div class="view" id="view-connections" role="tabpanel" aria-labelledby="tab-connections">
      <div style="max-width:900px;">
        <h2 style="color:#fff; margin-bottom:0.5rem;">Agent Connections</h2>
        <p style="color:#6a7a9a; margin-bottom:1.5rem; font-size:0.9rem;">Monitor HCS-10 connections and chat relay sessions with registered agents.</p>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; margin-bottom:2rem;">
          <div class="stat-card" style="text-align:center;">
            <div class="value" id="conn-active" style="color:#00d4ff;">0</div>
            <div class="label">Active Connections</div>
          </div>
          <div class="stat-card" style="text-align:center;">
            <div class="value" id="conn-pending" style="color:#f59e0b;">0</div>
            <div class="label">Pending Requests</div>
          </div>
          <div class="stat-card" style="text-align:center;">
            <div class="value" id="conn-relay" style="color:#a855f7;">0</div>
            <div class="label">Chat Relay Sessions</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
          <div>
            <h3 style="color:#00d4ff; font-size:1rem; margin-bottom:1rem;">HCS-10 Connections</h3>
            <div id="connections-list" style="min-height:100px;"></div>
          </div>
          <div>
            <h3 style="color:#a855f7; font-size:1rem; margin-bottom:1rem;">Chat Relay Sessions</h3>
            <div id="relay-sessions-list" style="min-height:100px;"></div>
          </div>
        </div>

        <div style="margin-top:2rem;">
          <h3 style="color:#f59e0b; font-size:1rem; margin-bottom:1rem;">Pending Connection Requests</h3>
          <div id="pending-requests-list" style="min-height:60px;"></div>
        </div>

        <button class="btn btn-primary" onclick="loadConnections()" style="margin-top:1.5rem; padding:0.75rem 2rem;">Refresh Connections</button>
      </div>
    </div>
    <!-- Live Demo View -->
    <div class="view" id="view-demo" role="tabpanel" aria-labelledby="tab-demo">
      <div style="max-width:800px;">
        <h2 style="color:#fff; margin-bottom:0.5rem;">Interactive Demo Pipeline</h2>
        <p style="color:#6a7a9a; margin-bottom:1rem; font-size:0.9rem;">Experience the complete 6-step marketplace pipeline: register an agent, discover agents, connect via HCS-10, send a task, get feedback, and award HCS-20 reputation points.</p>
        <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:0.5rem; margin-bottom:1.5rem;">
          <div class="demo-phase-indicator" id="demo-phase-1" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 1</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Register</div>
          </div>
          <div class="demo-phase-indicator" id="demo-phase-2" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 2</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Discover</div>
          </div>
          <div class="demo-phase-indicator" id="demo-phase-3" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 3</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Connect</div>
          </div>
          <div class="demo-phase-indicator" id="demo-phase-4" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 4</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Task</div>
          </div>
          <div class="demo-phase-indicator" id="demo-phase-5" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 5</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Feedback</div>
          </div>
          <div class="demo-phase-indicator" id="demo-phase-6" style="text-align:center; padding:0.5rem 0.25rem; border-radius:6px; background:#1a1f35; border:1px solid #1e2a4a;">
            <div style="font-size:0.65rem; color:#6a7a9a; text-transform:uppercase;">Step 6</div>
            <div style="font-size:0.7rem; color:#fff; margin-top:0.15rem;">Points</div>
          </div>
        </div>
        <button class="btn btn-primary" id="demo-run-btn" onclick="runDemoPipeline()" aria-label="Run demo pipeline" style="width:100%; padding:1rem; font-size:1rem; background:linear-gradient(135deg, #00c853, #00a040);">
          Run Demo Pipeline
        </button>
        <div id="demo-status" style="margin-top:1rem; padding:0.75rem; border-radius:8px; background:#111827; border:1px solid #1e2a4a; display:none;" aria-live="polite">
          <div style="color:#00d4ff; font-weight:600;" id="demo-status-text">Running demo...</div>
        </div>
        <div id="demo-steps" style="margin-top:1.5rem;" aria-live="polite"></div>
        <div id="demo-summary" style="margin-top:1.5rem; display:none;" aria-live="polite"></div>
      </div>
    </div>

  </div>

  <!-- Agent Detail Modal -->
  <div class="modal-overlay" id="agent-modal" role="dialog" aria-modal="true" aria-label="Agent Details">
    <div class="modal">
      <button class="modal-close" onclick="closeModal()" aria-label="Close modal">&times;</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer" role="contentinfo">
    Powered by <a href="https://hedera.com">Hedera</a> &middot; HCS-10 &middot; HCS-11 &middot; HCS-14 &middot; HCS-19 &middot; HCS-20 &middot; HCS-26 &middot; Built by <a href="https://opspawn.com">OpSpawn</a>
  </div>

  <script>
    // State
    let allAgents = [];
    let activityLog = [];
    let hireCount = 0;

    // Toast notification system
    function showToast(message, type) {
      type = type || 'info';
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.textContent = message;
      toast.setAttribute('role', 'alert');
      container.appendChild(toast);
      setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(function() { toast.remove(); }, 300); }, 4000);
    }

    // Navigation with keyboard support
    document.getElementById('nav').addEventListener('click', function(e) {
      const tab = e.target.closest('.nav-tab');
      if (!tab) return;
      switchTab(tab);
    });
    document.getElementById('nav').addEventListener('keydown', function(e) {
      const tab = e.target.closest('.nav-tab');
      if (!tab) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab); }
      if (e.key === 'ArrowRight') { const next = tab.nextElementSibling; if (next) { next.focus(); } }
      if (e.key === 'ArrowLeft') { const prev = tab.previousElementSibling; if (prev) { prev.focus(); } }
    });
    function switchTab(tab) {
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
      if (tab.dataset.view === 'connections') { loadConnections(); }
    }

    // Show skeleton loading
    function showSkeletonLoading(containerId, count) {
      count = count || 6;
      const container = document.getElementById(containerId);
      let html = '<div class="skeleton-grid">';
      for (let i = 0; i < count; i++) { html += '<div class="skeleton skeleton-card"></div>'; }
      html += '</div>';
      container.innerHTML = html;
    }

    // Marketplace search with error boundary
    async function searchMarketplace() {
      const q = document.getElementById('search').value;
      const category = document.getElementById('filter-category').value;
      const status = document.getElementById('filter-status').value;
      let url = '/api/marketplace/discover?';
      if (q) url += 'q=' + encodeURIComponent(q) + '&';
      if (category) url += 'category=' + encodeURIComponent(category) + '&';
      if (status) url += 'status=' + encodeURIComponent(status) + '&';
      showSkeletonLoading('marketplace-agents', 6);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, 10000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const data = await res.json();
        allAgents = data.agents || [];
        renderMarketplace(allAgents);
        updateStats(data);
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Request timed out' : 'Failed to load marketplace';
        document.getElementById('marketplace-agents').innerHTML = '<div class="error-state"><div class="error-icon">&#x26A0;</div><div class="error-msg">' + esc(msg) + '</div><button class="btn btn-primary" onclick="searchMarketplace()">Retry</button></div>';
      }
    }

    const AGENT_EMOJIS = ['\\u{1F916}', '\\u{1F9E0}', '\\u{1F4A1}', '\\u{1F680}', '\\u{1F50D}', '\\u{1F3AF}', '\\u{26A1}', '\\u{1F9D9}', '\\u{1F525}', '\\u{1F4BB}'];

    function getAgentEmoji(name) {
      let hash = 0;
      for (let i = 0; i < (name || '').length; i++) { hash = ((hash << 5) - hash) + name.charCodeAt(i); hash |= 0; }
      return AGENT_EMOJIS[Math.abs(hash) % AGENT_EMOJIS.length];
    }

    function renderMarketplace(agents) {
      const container = document.getElementById('marketplace-agents');
      if (!agents.length) {
        container.innerHTML = '<div class="empty-state"><div class="icon">&#x1F916;</div><p>No agents found. Register one to get started!</p></div>';
        return;
      }
      container.innerHTML = agents.map(ma => {
        const a = ma.agent;
        const identity = ma.identity || {};
        const vs = ma.verificationStatus || 'unverified';
        const skills = (a.skills || []);
        const publishedSkills = (ma.publishedSkills || []);
        const emoji = getAgentEmoji(a.name);
        return \`
          <div class="agent-card" onclick="showAgentDetail('\${a.agent_id}')">
            <div class="agent-header">
              <div class="agent-name-group">
                <div class="agent-avatar">\${emoji}</div>
                <div class="agent-name">\${esc(a.name)}</div>
              </div>
              <span class="badge badge-\${vs}">\${vs}</span>
            </div>
            <div class="agent-desc">\${esc(a.description)}</div>
            <div class="agent-meta">
              <span class="badge badge-\${a.status || 'offline'}">\${a.status || 'offline'}</span>
              <span class="agent-reputation">\${'\u2B50'} \${a.reputation_score || 0}</span>
              \${ma.points ? '<span style="font-size:0.8rem; color:#a855f7;">' + ma.points.total_points + ' pts</span>' : ''}
            </div>
            <div>\${skills.map(function(s, i) { return '<span class="skill-tag skill-tag-' + (i % 6) + '">' + esc(s.name) + '</span>'; }).join('')}</div>
            <div style="margin-top:0.5rem; display:flex; gap:0.25rem; flex-wrap:wrap;">\${(a.protocols || []).map(function(p) {
              var color = p.includes('hcs') ? '#00d4ff' : p.includes('a2a') ? '#00c853' : p.includes('mcp') ? '#a855f7' : p.includes('x402') ? '#ffaa00' : '#6a7a9a';
              return '<span style="font-size:0.6rem; padding:0.12rem 0.4rem; border-radius:4px; background:rgba(255,255,255,0.04); border:1px solid ' + color + '30; color:' + color + ';">' + esc(p) + '</span>';
            }).join('')}</div>
            <div class="agent-identity">
              DID: <code>\${esc(identity.did || 'pending')}</code>
              \${publishedSkills.length ? ' &middot; ' + publishedSkills.length + ' published skill(s)' : ''}
            </div>
            <div class="agent-actions">
              <button class="btn btn-hire" onclick="event.stopPropagation(); openHireModal('\${a.agent_id}')">Hire Agent</button>
              <button class="btn btn-secondary" onclick="event.stopPropagation(); showAgentDetail('\${a.agent_id}')" style="font-size:0.8rem; padding:0.5rem 1rem;">Details</button>
            </div>
          </div>\`;
      }).join('');
    }

    // Registry view with error boundary
    async function searchRegistry() {
      const q = document.getElementById('registry-search').value;
      let url = '/api/marketplace/discover?';
      if (q) url += 'q=' + encodeURIComponent(q);
      showSkeletonLoading('registry-agents', 3);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, 10000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const data = await res.json();
        renderRegistry(data.agents || []);
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Request timed out' : 'Failed to load registry';
        document.getElementById('registry-agents').innerHTML = '<div class="error-state"><div class="error-icon">&#x26A0;</div><div class="error-msg">' + esc(msg) + '</div><button class="btn btn-primary" onclick="searchRegistry()">Retry</button></div>';
      }
    }

    function renderRegistry(agents) {
      const container = document.getElementById('registry-agents');
      if (!agents.length) {
        container.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4CB;</div><p>No agents in registry</p></div>';
        return;
      }
      container.innerHTML = agents.map(ma => {
        const a = ma.agent;
        const identity = ma.identity || {};
        const profile = ma.profile || {};
        const vs = ma.verificationStatus || 'unverified';
        const publishedSkills = ma.publishedSkills || [];
        return \`
          <div class="agent-card">
            <div class="agent-header">
              <div class="agent-name">\${esc(a.name)}</div>
              <span class="badge badge-\${vs}">\${vs}</span>
            </div>
            <div class="agent-identity" style="border:none; padding:0; margin-bottom:0.75rem;">
              <div><strong style="color:#6a7a9a;">Agent ID:</strong> <code>\${esc(a.agent_id)}</code></div>
              <div><strong style="color:#6a7a9a;">DID:</strong> <code>\${esc(identity.did || 'N/A')}</code></div>
              <div><strong style="color:#6a7a9a;">Identity Topic:</strong> <code>\${esc(identity.identity_topic_id || 'N/A')}</code></div>
              <div><strong style="color:#6a7a9a;">Profile Topic:</strong> <code>\${esc(a.profile_topic || 'N/A')}</code></div>
              <div><strong style="color:#6a7a9a;">Status:</strong> \${esc(identity.status || a.status || 'unknown')}</div>
            </div>
            <div style="margin-bottom:0.5rem;">
              <strong style="color:#6a7a9a; font-size:0.75rem; text-transform:uppercase;">Skills (HCS-26)</strong>
            </div>
            <div>\${(a.skills || []).map(function(s, i) { return '<span class="skill-tag skill-tag-' + (i % 6) + '">' + esc(s.name) + (s.category ? ' (' + esc(s.category) + ')' : '') + '</span>'; }).join('')}</div>
            \${publishedSkills.length ? '<div style="margin-top:0.5rem; font-size:0.75rem; color:#a855f7;">' + publishedSkills.length + ' skill(s) published on HCS-26 registry</div>' : ''}
            <div style="margin-top:0.5rem; font-size:0.75rem; color:#4a5a7a;">Protocols: \${(a.protocols || []).join(', ')}</div>
          </div>\`;
      }).join('');
    }

    // Agent detail modal
    async function showAgentDetail(agentId) {
      const modal = document.getElementById('agent-modal');
      const content = document.getElementById('modal-content');
      content.innerHTML = '<div class="loading">Loading agent profile...</div>';
      modal.classList.add('active');
      try {
        const res = await fetch('/api/marketplace/agent/' + encodeURIComponent(agentId));
        if (!res.ok) throw new Error('Not found');
        const ma = await res.json();
        const a = ma.agent;
        const identity = ma.identity || {};
        const profile = ma.profile || {};
        const vs = ma.verificationStatus;
        const publishedSkills = ma.publishedSkills || [];
        content.innerHTML = \`
          <h2>\${esc(a.name)} <span class="badge badge-\${vs}" style="font-size:0.8rem;">\${vs}</span></h2>
          <p style="color:#8892b0; margin-bottom:1.25rem;">\${esc(a.description)}</p>
          <div class="modal-section">
            <h3>HCS-19 Identity</h3>
            <div class="modal-field"><span class="label">DID</span><span class="value">\${esc(identity.did || 'N/A')}</span></div>
            <div class="modal-field"><span class="label">Identity Topic</span><span class="value">\${esc(identity.identity_topic_id || 'N/A')}</span></div>
            <div class="modal-field"><span class="label">Verification</span><span class="value">\${vs}</span></div>
            <div class="modal-field"><span class="label">Status</span><span class="value">\${esc(identity.status || 'active')}</span></div>
          </div>
          <div class="modal-section">
            <h3>HCS-11 Profile</h3>
            <div class="modal-field"><span class="label">Display Name</span><span class="value">\${esc(profile.display_name || a.name)}</span></div>
            <div class="modal-field"><span class="label">Capabilities</span><span class="value">\${(profile.capabilities || []).join(', ') || 'N/A'}</span></div>
            <div class="modal-field"><span class="label">Protocols</span><span class="value">\${(a.protocols || []).join(', ')}</span></div>
          </div>
          <div class="modal-section">
            <h3>HCS-26 Skills</h3>
            <div>\${(a.skills || []).map(s => \`
              <div style="background:#0d1528; padding:0.75rem; border-radius:8px; border:1px solid #1e2a4a; margin-bottom:0.5rem;">
                <div style="color:#00aaff; font-weight:500;">\${esc(s.name)}</div>
                <div style="color:#6a7a9a; font-size:0.8rem;">\${esc(s.description || '')} &middot; \${esc(s.category || 'general')}</div>
                <div style="color:#ffaa00; font-size:0.8rem; margin-top:0.25rem;">\${s.pricing ? s.pricing.amount + ' ' + s.pricing.token + '/' + s.pricing.unit : 'Free'}</div>
              </div>\`).join('')}
            </div>
            \${publishedSkills.length ? '<div style="font-size:0.8rem; color:#a855f7; margin-top:0.5rem;">' + publishedSkills.length + ' skill manifest(s) published on-chain</div>' : ''}
          </div>
          \${ma.points ? \`
          <div class="modal-section">
            <h3>HCS-20 Reputation Points</h3>
            <div class="modal-field"><span class="label">Total Points</span><span class="value" style="color:#a855f7; font-weight:600;">\${ma.points.total_points}</span></div>
            \${Object.entries(ma.points.breakdown || {}).map(([k, v]) => \`
              <div class="modal-field"><span class="label">\${esc(k)}</span><span class="value">\${v}</span></div>\`).join('')}
            <div class="modal-field"><span class="label">History Entries</span><span class="value">\${(ma.points.entries || []).length}</span></div>
          </div>\` : ''}
          <div class="modal-section">
            <h3>Network</h3>
            <div class="modal-field"><span class="label">Endpoint</span><span class="value">\${esc(a.endpoint)}</span></div>
            <div class="modal-field"><span class="label">Inbound Topic</span><span class="value">\${esc(a.inbound_topic || 'N/A')}</span></div>
            <div class="modal-field"><span class="label">Outbound Topic</span><span class="value">\${esc(a.outbound_topic || 'N/A')}</span></div>
            <div class="modal-field"><span class="label">Reputation</span><span class="value">\${a.reputation_score || 0}</span></div>
          </div>
          <button class="btn btn-hire" style="width:100%; margin-top:1rem; padding:0.8rem;" onclick="closeModal(); openHireModal('\${a.agent_id}')">Hire This Agent</button>\`;
      } catch (e) {
        content.innerHTML = '<div class="loading">Agent not found</div>';
      }
    }

    function closeModal() {
      document.getElementById('agent-modal').classList.remove('active');
    }
    document.getElementById('agent-modal').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // Hire flow
    function openHireModal(agentId) {
      const agent = allAgents.find(ma => ma.agent.agent_id === agentId);
      if (!agent) return;
      const a = agent.agent;
      const skills = a.skills || [];
      const modal = document.getElementById('agent-modal');
      const content = document.getElementById('modal-content');
      content.innerHTML = \`
        <h2>Hire \${esc(a.name)}</h2>
        <p style="color:#8892b0; margin-bottom:1rem;">Select a skill and provide input to hire this agent.</p>
        <div class="hire-form">
          <label>Select Skill</label>
          <select id="hire-skill">
            \${skills.map(s => '<option value="' + esc(s.id || s.name) + '">' + esc(s.name) + ' (' + (s.pricing ? s.pricing.amount + ' ' + s.pricing.token : 'Free') + ')</option>').join('')}
          </select>
          <label>Client ID</label>
          <input type="text" id="hire-client" placeholder="0.0.your-account" />
          <label>Task Input (JSON)</label>
          <textarea id="hire-input" rows="3" placeholder='{"text": "Hello world"}'></textarea>
          <button class="btn btn-hire" style="width:100%; margin-top:0.5rem;" onclick="executeHire('\${a.agent_id}')">Execute Hire</button>
          <div id="hire-result"></div>
        </div>\`;
      modal.classList.add('active');
    }

    async function executeHire(agentId) {
      const skillId = document.getElementById('hire-skill').value;
      const clientId = document.getElementById('hire-client').value || '0.0.anonymous';
      let input = {};
      try { input = JSON.parse(document.getElementById('hire-input').value || '{}'); } catch(e) {}
      const resultDiv = document.getElementById('hire-result');
      resultDiv.innerHTML = '<div style="color:#6a7a9a; padding:0.5rem;"><span class="loading-spinner"></span> Processing hire request...</div>';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, 15000);
        const res = await fetch('/api/marketplace/hire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ clientId, agentId, skillId, input }),
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (res.ok && data.status !== 'failed') {
          hireCount++;
          animateStat(document.getElementById('stat-hires'), hireCount);
          addActivity('hire', 'Agent hired', 'Task ' + data.task_id + ' created for skill ' + skillId + ' (+50 HCS-20 pts)');
          resultDiv.innerHTML = '<div class="hire-result success success-overlay" role="alert">Hire successful! Task ID: ' + esc(data.task_id) + '<br>+50 HCS-20 reputation points awarded</div>';
          showToast('Agent hired successfully!', 'success');
        } else {
          resultDiv.innerHTML = '<div class="hire-result error" role="alert">Hire failed: ' + esc(data.output?.error || data.error || 'Unknown error') + '</div>';
        }
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Request timed out' : 'Request failed — check your connection.';
        resultDiv.innerHTML = '<div class="hire-result error" role="alert">' + esc(msg) + '</div>';
      }
    }

    // Registration form validation
    function validateField(input, field) {
      const val = input.value.trim();
      const errEl = document.getElementById('err-' + field);
      let valid = true;
      if (field === 'name') { valid = val.length >= 2; }
      else if (field === 'description') { valid = val.length >= 10; }
      else if (field === 'endpoint') { valid = /^https?:\\/\\/.+/.test(val); }
      else if (field === 'skill') { valid = val.length === 0 || val.length >= 2; }
      input.classList.toggle('valid', valid && val.length > 0);
      input.classList.toggle('invalid', !valid && val.length > 0);
      if (errEl) { errEl.classList.toggle('visible', !valid && val.length > 0); }
      updateRegProgress();
      return valid;
    }

    function updateRegProgress() {
      // 3-step progress: Identity (name+endpoint), Details (description), Skills (skill-name)
      var stepGroups = [['reg-name', 'reg-endpoint'], ['reg-description'], ['reg-skill-name', 'reg-skill-category', 'reg-payment']];
      stepGroups.forEach(function(group, i) {
        var step = document.getElementById('reg-step-' + (i + 1));
        if (!step) return;
        var filled = group.some(function(id) { var el = document.getElementById(id); return el && el.value.trim().length > 0; });
        var allFilled = group.every(function(id) { var el = document.getElementById(id); return el && el.value.trim().length > 0; });
        step.className = 'register-step' + (allFilled ? ' filled' : filled ? ' active' : '');
      });
    }

    // Register agent with validation
    async function registerAgent() {
      const name = document.getElementById('reg-name').value.trim();
      const description = document.getElementById('reg-description').value.trim();
      const endpoint = document.getElementById('reg-endpoint').value.trim();
      const skillName = document.getElementById('reg-skill-name').value.trim() || 'Default Skill';
      const skillCategory = document.getElementById('reg-skill-category').value.trim() || 'general';
      const payment = document.getElementById('reg-payment').value.trim() || '0.0.payment';
      const resultDiv = document.getElementById('register-result');
      const submitBtn = document.getElementById('reg-submit-btn');

      // Validate required fields
      let isValid = true;
      if (name.length < 2) { validateField(document.getElementById('reg-name'), 'name'); isValid = false; }
      if (description.length < 10) { validateField(document.getElementById('reg-description'), 'description'); isValid = false; }
      if (!/^https?:\\/\\/.+/.test(endpoint)) { validateField(document.getElementById('reg-endpoint'), 'endpoint'); isValid = false; }

      if (!isValid) {
        resultDiv.innerHTML = '<div class="hire-result error" role="alert">Please fix the highlighted fields above</div>';
        showToast('Please fill in all required fields correctly', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loading-spinner"></span> Registering with 6 HCS standards...';
      resultDiv.innerHTML = '';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, 15000);
        const res = await fetch('/api/marketplace/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            name,
            description,
            endpoint,
            skills: [{
              id: skillName.toLowerCase().replace(/\\s+/g, '-'),
              name: skillName,
              description: description,
              category: skillCategory,
              tags: [skillCategory],
              input_schema: { type: 'object' },
              output_schema: { type: 'object' },
              pricing: { amount: 0, token: 'HBAR', unit: 'per_call' },
            }],
            protocols: ['a2a-v0.3', 'hcs-10'],
            payment_address: payment,
          }),
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (res.ok) {
          addActivity('register', 'New agent registered', data.agent.name + ' (DID: ' + (data.identity?.did || 'pending') + ')');
          resultDiv.innerHTML = '<div class="hire-result success success-overlay" role="alert">Agent registered successfully!<br>ID: ' + esc(data.agent.agent_id) + '<br>DID: ' + esc(data.identity?.did || 'N/A') + '<br>Verification: ' + esc(data.verificationStatus) + '<br>+100 HCS-20 registration points</div>';
          showToast('Agent registered successfully!', 'success');
          // Reset form
          document.getElementById('register-form').reset();
          document.querySelectorAll('.register-step').forEach(function(s) { s.classList.remove('filled', 'active'); });
          document.querySelectorAll('#register-form input, #register-form textarea').forEach(function(el) { el.classList.remove('valid', 'invalid'); });
          searchMarketplace();
        } else {
          resultDiv.innerHTML = '<div class="hire-result error" role="alert">' + esc(data.message || 'Registration failed') + '</div>';
          showToast('Registration failed: ' + (data.message || 'Unknown error'), 'error');
        }
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Registration timed out — the server may be busy. Please try again.' : 'Request failed — check your connection.';
        resultDiv.innerHTML = '<div class="hire-result error" role="alert">' + esc(msg) + '</div>';
        showToast(msg, 'error');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register Agent';
    }

    // Activity feed
    function addActivity(type, title, detail) {
      activityLog.unshift({ type, title, detail, time: new Date().toISOString() });
      if (activityLog.length > 50) activityLog = activityLog.slice(0, 50);
      renderActivity();
    }

    function renderActivity() {
      const container = document.getElementById('activity-feed');
      if (!activityLog.length) {
        container.innerHTML = '<div class="feed-empty">No recent activity. Register or hire an agent to see events here.</div>';
        return;
      }
      const icons = { register: '&#x1F4DD;', skill: '&#x1F9E9;', hire: '&#x2705;' };
      const typeLabels = { register: 'Register', skill: 'Skill', hire: 'Hire' };
      container.innerHTML = activityLog.map(item => \`
        <div class="feed-item">
          <div class="feed-icon \${item.type}">\${icons[item.type] || '&#x1F4AC;'}</div>
          <div class="feed-content">
            <div class="feed-title"><strong>\${esc(item.title)}</strong> <span class="feed-type-pill \${item.type}">\${typeLabels[item.type] || 'Event'}</span></div>
            <div style="color:#8892b0; font-size:0.8rem;">\${esc(item.detail)}</div>
            <div class="feed-time">\${timeAgo(item.time)}</div>
          </div>
        </div>\`).join('');
    }

    // Stats with animation
    function animateStat(el, newVal) {
      const old = parseInt(el.textContent) || 0;
      if (old !== newVal) {
        el.textContent = newVal;
        el.classList.add('updated');
        setTimeout(function() { el.classList.remove('updated'); }, 500);
      }
    }
    function updateStats(data) {
      const agents = data.agents || [];
      const totalAgents = data.total || agents.length;
      const totalSkills = agents.reduce(function(sum, ma) { return sum + ((ma.agent?.skills || []).length) + ((ma.publishedSkills || []).length); }, 0);
      const active = agents.filter(function(ma) { return ma.agent?.status === 'online'; }).length;
      animateStat(document.getElementById('stat-agents'), totalAgents);
      animateStat(document.getElementById('stat-skills'), totalSkills);
      animateStat(document.getElementById('stat-active'), active);
      animateStat(document.getElementById('stat-hires'), hireCount);
    }

    // Utilities
    function esc(str) {
      if (!str) return '';
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }

    function timeAgo(isoStr) {
      const seconds = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }

    // Category chip filter
    function filterByCategory(chip) {
      document.querySelectorAll('.category-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      var cat = chip.getAttribute('data-category');
      document.getElementById('filter-category').value = cat;
      searchMarketplace();
    }

    // Keyboard shortcuts
    document.getElementById('search').addEventListener('keypress', e => { if (e.key === 'Enter') searchMarketplace(); });
    document.getElementById('registry-search').addEventListener('keypress', e => { if (e.key === 'Enter') searchRegistry(); });

    // Pre-populate activity feed from seeded agents
    async function loadInitialActivity() {
      try {
        const res = await fetch('/api/marketplace/discover?limit=20');
        const data = await res.json();
        const agents = data.agents || [];
        for (const ma of agents.reverse()) {
          const a = ma.agent;
          activityLog.push({ type: 'register', title: 'Agent registered', detail: a.name + ' joined the marketplace with ' + (a.skills || []).length + ' skill(s)', time: a.registered_at || new Date().toISOString() });
          if (ma.publishedSkills && ma.publishedSkills.length) {
            activityLog.push({ type: 'skill', title: 'Skills published', detail: a.name + ' published ' + ma.publishedSkills.length + ' skill manifest(s) to HCS-26', time: a.registered_at || new Date().toISOString() });
          }
        }
        renderActivity();
      } catch(e) {}
    }

    // Live Demo
    let demoRunning = false;
    // Load connections & relay sessions
    async function loadConnections() {
      try {
        const [connRes, relayRes] = await Promise.all([
          fetch('/api/connections').then(function(r) { return r.json(); }),
          fetch('/api/chat/relay/sessions').then(function(r) { return r.json(); }).catch(function() { return { sessions: [] }; }),
        ]);

        document.getElementById('conn-active').textContent = connRes.active || 0;
        document.getElementById('conn-pending').textContent = connRes.pending || 0;
        document.getElementById('conn-relay').textContent = (relayRes.sessions || []).length;

        var connList = document.getElementById('connections-list');
        var connections = connRes.connections || [];
        if (connections.length === 0) {
          connList.innerHTML = '<div style="color:#6a7a9a; font-size:0.85rem; padding:1rem; background:#111827; border-radius:8px; border:1px solid #1e2a4a;">No connections yet. Connect to agents via the API or chat interface.</div>';
        } else {
          connList.innerHTML = connections.map(function(c) {
            var statusColor = c.status === 'active' ? '#00d4ff' : '#6a7a9a';
            return '<div style="padding:0.75rem; margin-bottom:0.5rem; background:#111827; border-radius:8px; border:1px solid #1e2a4a;">' +
              '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              '<span style="color:#fff; font-size:0.85rem; font-weight:600;">' + c.remote_account + '</span>' +
              '<span style="color:' + statusColor + '; font-size:0.75rem; text-transform:uppercase;">' + c.status + '</span>' +
              '</div>' +
              '<div style="color:#6a7a9a; font-size:0.75rem; margin-top:0.25rem;">' + c.messages_exchanged + ' messages | ' + c.connection_topic + '</div>' +
              '</div>';
          }).join('');
        }

        var relayList = document.getElementById('relay-sessions-list');
        var sessions = relayRes.sessions || [];
        if (sessions.length === 0) {
          relayList.innerHTML = '<div style="color:#6a7a9a; font-size:0.85rem; padding:1rem; background:#111827; border-radius:8px; border:1px solid #1e2a4a;">No chat relay sessions. Start one via chat: &quot;Chat with agent [id]&quot;</div>';
        } else {
          relayList.innerHTML = sessions.map(function(s) {
            return '<div style="padding:0.75rem; margin-bottom:0.5rem; background:#111827; border-radius:8px; border:1px solid #1e2a4a;">' +
              '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              '<span style="color:#fff; font-size:0.85rem; font-weight:600;">Agent: ' + s.agentId + '</span>' +
              '<span style="color:#a855f7; font-size:0.75rem;">' + s.messageCount + ' msgs</span>' +
              '</div>' +
              '<div style="color:#6a7a9a; font-size:0.75rem; margin-top:0.25rem;">Session: ' + s.sessionId + '</div>' +
              '</div>';
          }).join('');
        }

        var pendingList = document.getElementById('pending-requests-list');
        var pendingReqs = connRes.pending_requests || [];
        if (pendingReqs.length === 0) {
          pendingList.innerHTML = '<div style="color:#6a7a9a; font-size:0.85rem; padding:1rem; background:#111827; border-radius:8px; border:1px solid #1e2a4a;">No pending connection requests.</div>';
        } else {
          pendingList.innerHTML = pendingReqs.map(function(r) {
            return '<div style="padding:0.75rem; margin-bottom:0.5rem; background:#111827; border-radius:8px; border:1px solid #2d1f0a;">' +
              '<div style="color:#f59e0b; font-size:0.85rem; font-weight:600;">From: ' + r.from_account + '</div>' +
              '<div style="color:#6a7a9a; font-size:0.75rem; margin-top:0.25rem;">' + r.timestamp + ' | Topic: ' + r.from_inbound_topic + '</div>' +
              '</div>';
          }).join('');
        }
      } catch (e) {
        document.getElementById('connections-list').innerHTML = '<div style="color:#ff4444; font-size:0.85rem;">Error loading connections: ' + e.message + '</div>';
      }
    }

    async function runDemoPipeline() {
      if (demoRunning) return;
      demoRunning = true;
      const btn = document.getElementById('demo-run-btn');
      const statusDiv = document.getElementById('demo-status');
      const statusText = document.getElementById('demo-status-text');
      const stepsDiv = document.getElementById('demo-steps');
      const summaryDiv = document.getElementById('demo-summary');
      btn.disabled = true;
      btn.textContent = 'Pipeline Running...';
      btn.style.opacity = '0.6';
      statusDiv.style.display = 'block';
      statusText.textContent = 'Running 6-step demo pipeline...';
      stepsDiv.innerHTML = '';
      summaryDiv.style.display = 'none';

      // Reset phase indicators
      for (var i = 1; i <= 6; i++) {
        var phase = document.getElementById('demo-phase-' + i);
        if (phase) { phase.style.background = '#1a1f35'; phase.style.borderColor = '#1e2a4a'; }
      }

      try {
        const res = await fetch('/api/demo/flow');
        const data = await res.json();

        if (data.steps) {
          const phaseIcons = { registration: '&#x1F4DD;', discovery: '&#x1F50D;', connection: '&#x1F517;', execution: '&#x1F4BC;', feedback: '&#x2B50;', points: '&#x1F3C6;' };
          stepsDiv.innerHTML = data.steps.map(function(s) {
            var statusColor = s.status === 'completed' ? '#00c853' : '#ff4444';
            var statusIcon = s.status === 'completed' ? '&#x2705;' : '&#x274C;';
            // Light up phase indicator
            var phaseEl = document.getElementById('demo-phase-' + s.step);
            if (phaseEl) {
              phaseEl.style.background = s.status === 'completed' ? 'rgba(0,200,83,0.15)' : 'rgba(255,68,68,0.15)';
              phaseEl.style.borderColor = s.status === 'completed' ? '#00c853' : '#ff4444';
            }
            return '<div class="feed-item" style="margin-bottom:0.5rem;">' +
              '<div class="feed-icon" style="background:rgba(0,212,255,0.15); color:#00d4ff;">' + (phaseIcons[s.phase] || '&#x1F4AC;') + '</div>' +
              '<div class="feed-content">' +
              '<div class="feed-title"><strong>Step ' + s.step + ': ' + esc(s.title) + '</strong> <span style="color:' + statusColor + '; font-size:0.75rem;">' + statusIcon + ' ' + s.status + '</span></div>' +
              '<div style="color:#8892b0; font-size:0.8rem;">' + esc(s.detail) + '</div>' +
              '<div style="color:#3a4a6a; font-size:0.7rem; margin-top:0.15rem;">' + s.duration_ms + 'ms</div>' +
              '</div></div>';
          }).join('');

          // Add to activity feed
          for (var j = 0; j < data.steps.length; j++) {
            var s = data.steps[j];
            addActivity('skill', 'Pipeline: ' + s.title, s.detail);
          }
        }

        if (data.status === 'completed') {
          statusText.textContent = 'Pipeline completed successfully! All 6 steps passed.';
          statusText.style.color = '#00c853';
        } else if (data.status === 'partial') {
          statusText.textContent = 'Pipeline partially completed (' + (data.summary ? data.summary.completed_steps : '?') + '/' + (data.summary ? data.summary.total_steps : '?') + ' steps).';
          statusText.style.color = '#f59e0b';
        } else {
          statusText.textContent = 'Pipeline failed.';
          statusText.style.color = '#ff4444';
        }

        if (data.summary) {
          summaryDiv.style.display = 'block';
          summaryDiv.innerHTML =
            '<div style="background:#111827; padding:1.25rem; border-radius:12px; border:1px solid #1e2a4a;">' +
            '<h3 style="color:#00d4ff; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.75rem;">Pipeline Summary</h3>' +
            '<div class="modal-field"><span class="label">Status</span><span class="value" style="color:' + (data.status === 'completed' ? '#00c853' : '#f59e0b') + ';">' + data.status + '</span></div>' +
            '<div class="modal-field"><span class="label">Steps Completed</span><span class="value">' + data.summary.completed_steps + '/' + data.summary.total_steps + '</span></div>' +
            '<div class="modal-field"><span class="label">Agent Registered</span><span class="value" style="color:#00d4ff;">' + esc(data.summary.agent_registered || 'N/A') + '</span></div>' +
            '<div class="modal-field"><span class="label">Agents Discovered</span><span class="value">' + data.summary.agents_discovered + '</span></div>' +
            '<div class="modal-field"><span class="label">Duration</span><span class="value">' + data.total_duration_ms + 'ms</span></div>' +
            '</div>';
        }
      } catch(e) {
        statusText.textContent = 'Failed to run pipeline: ' + e.message;
        statusText.style.color = '#ff4444';
      }

      btn.disabled = false;
      btn.textContent = 'Run Demo Pipeline';
      btn.style.opacity = '1';
      demoRunning = false;
      // Refresh marketplace data
      searchMarketplace();
    }

    // Legacy alias
    async function runLiveDemo() { return runDemoPipeline(); }

    async function pollDemoStatus(stepsDiv, statusText, summaryDiv) {
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        try {
          const res = await fetch('/api/demo/status');
          const state = await res.json();

          // Render steps
          const stepIcons = { seed: '&#x1F331;', search: '&#x1F50D;', select: '&#x1F3AF;', hire: '&#x1F4BC;', complete: '&#x2705;', rate: '&#x2B50;', points: '&#x1F3C6;' };
          stepsDiv.innerHTML = (state.steps || []).map(s => \`
            <div class="feed-item" style="margin-bottom:0.5rem;">
              <div class="feed-icon" style="background:rgba(0,212,255,0.15); color:#00d4ff;">\${stepIcons[s.type] || '&#x1F4AC;'}</div>
              <div class="feed-content">
                <div class="feed-title"><strong>Step \${s.step}: \${esc(s.title)}</strong></div>
                <div style="color:#8892b0; font-size:0.8rem;">\${esc(s.detail)}</div>
              </div>
            </div>\`).join('');

          // Add to global activity feed
          for (const s of (state.steps || [])) {
            const existing = activityLog.find(a => a.title === 'Demo: ' + s.title);
            if (!existing) {
              addActivity(s.type === 'hire' ? 'hire' : s.type === 'seed' ? 'register' : 'skill', 'Demo: ' + s.title, s.detail);
            }
          }

          if (state.status === 'completed') {
            statusText.textContent = 'Demo completed successfully!';
            statusText.style.color = '#00c853';
            if (state.summary) {
              summaryDiv.style.display = 'block';
              summaryDiv.innerHTML = \`
                <div style="background:#111827; padding:1.25rem; border-radius:12px; border:1px solid #1e2a4a;">
                  <h3 style="color:#00d4ff; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.75rem;">Demo Summary</h3>
                  <div class="modal-field"><span class="label">Agents Seeded</span><span class="value">\${state.summary.agentsSeeded}</span></div>
                  <div class="modal-field"><span class="label">Search Results</span><span class="value">\${state.summary.searchResults}</span></div>
                  <div class="modal-field"><span class="label">Selected Agent</span><span class="value" style="color:#00d4ff;">\${esc(state.summary.selectedAgent)}</span></div>
                  <div class="modal-field"><span class="label">Task ID</span><span class="value" style="font-size:0.75rem;">\${esc(state.summary.hireTaskId)}</span></div>
                  <div class="modal-field"><span class="label">Points Awarded</span><span class="value" style="color:#a855f7; font-weight:600;">+\${state.summary.pointsAwarded}</span></div>
                  <div class="modal-field"><span class="label">Total Steps</span><span class="value">\${state.summary.totalSteps}</span></div>
                </div>\`;
            }
            break;
          } else if (state.status === 'failed') {
            statusText.textContent = 'Demo failed: ' + (state.error || 'Unknown error');
            statusText.style.color = '#ff4444';
            break;
          } else {
            statusText.textContent = 'Running step ' + (state.steps || []).length + '...';
          }
        } catch (e) {
          // Retry
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // HOL Registry functions
    async function loadHolStatus() {
      try {
        const [regRes, connRes] = await Promise.all([
          fetchWithTimeout('/api/registry/status'),
          fetchWithTimeout('/api/agent/connections'),
        ]);
        const regData = await regRes.json();
        const connData = await connRes.json();

        document.getElementById('hol-broker-status').textContent = regData.registered ? 'Registered' : 'Not Registered';
        document.getElementById('hol-broker-status').style.color = regData.registered ? '#00c853' : '#ffaa00';
        document.getElementById('hol-uaid').textContent = regData.uaid || 'Not registered';
        document.getElementById('hol-last-check').textContent = regData.lastCheck ? new Date(regData.lastCheck).toLocaleTimeString() : '--';

        document.getElementById('hol-connection-status').textContent = connData.running ? 'Active' : 'Inactive';
        document.getElementById('hol-connection-status').style.color = connData.running ? '#00c853' : '#6a7a9a';
        document.getElementById('hol-active-connections').textContent = String(connData.active || 0);
        document.getElementById('hol-pending').textContent = String(connData.pending || 0);

        const conns = connData.connections || [];
        if (conns.length > 0) {
          document.getElementById('hol-connections-detail').innerHTML = conns.map(function(c) {
            return '<div style="padding:0.5rem; background:#0d1528; border-radius:6px; margin-bottom:0.5rem; border:1px solid #1e2a4a;">' +
              '<div style="color:#00d4ff; font-size:0.8rem;">' + esc(c.remote_account) + '</div>' +
              '<div style="color:#6a7a9a; font-size:0.75rem;">Topic: ' + esc(c.connection_topic) + ' | Status: ' + esc(c.status) + '</div>' +
            '</div>';
          }).join('');
        }
      } catch (e) {
        document.getElementById('hol-broker-status').textContent = 'Error';
        document.getElementById('hol-broker-status').style.color = '#ff4444';
      }
    }

    async function triggerHolRegistration() {
      const btn = document.getElementById('hol-register-btn');
      btn.disabled = true;
      btn.textContent = 'Registering...';
      try {
        const res = await fetchWithTimeout('/api/registry/register', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.success) {
          btn.textContent = 'Registered!';
          btn.style.background = 'linear-gradient(135deg, #00c853, #00a040)';
        } else {
          btn.textContent = 'Failed: ' + (data.error || 'Unknown');
          btn.style.background = '#ff4444';
        }
        setTimeout(loadHolStatus, 1000);
      } catch (e) {
        btn.textContent = 'Error';
        btn.style.background = '#ff4444';
      }
      setTimeout(function() { btn.disabled = false; btn.textContent = 'Register with HOL'; btn.style.background = ''; }, 5000);
    }

    // Load testnet status
    async function loadTestnetStatus() {
      try {
        const res = await fetch('/api/testnet/status');
        const data = await res.json();
        const modeEl = document.getElementById('testnet-mode');
        const infoEl = document.getElementById('testnet-info');
        const topicsEl = document.getElementById('testnet-topics');
        const msgsEl = document.getElementById('testnet-messages');
        const dotEl = document.getElementById('testnet-dot');
        if (data.mode === 'live') {
          modeEl.textContent = 'Live Testnet';
          modeEl.style.color = '#00c853';
          dotEl.style.background = '#00c853';
          infoEl.textContent = 'Connected to Hedera ' + data.network;
        } else {
          modeEl.textContent = 'Mock Mode';
          modeEl.style.color = '#ffaa00';
          dotEl.style.background = '#ffaa00';
          infoEl.textContent = 'No testnet credentials';
        }
        if (data.session) {
          topicsEl.textContent = data.session.topicsCreated + ' topics (' + data.session.onChainTopics + ' on-chain)';
          msgsEl.textContent = data.session.messagesSubmitted + ' messages (' + data.session.onChainMessages + ' on-chain)';
        }
      } catch (e) {
        document.getElementById('testnet-info').textContent = 'Status unavailable';
      }
    }

    // Initial load
    searchMarketplace();
    searchRegistry();
    loadInitialActivity();
    loadHolStatus();
    loadTestnetStatus();
  </script>
</body>
</html>`;
}

function getDemoPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hedera Agent Marketplace — Live Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080c14; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; }

    .demo-header { background: linear-gradient(135deg, #0d1528 0%, #131b30 50%, #0f1a2e 100%); padding: 2rem 3rem; border-bottom: 1px solid #1e2a4a; text-align: center; }
    .demo-header h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    .demo-header h1 span { color: #00d4ff; }
    .demo-header p { color: #6a7a9a; font-size: 1rem; }
    .standards-row { display: flex; justify-content: center; gap: 0.5rem; margin-top: 1rem; }
    .std-badge { padding: 0.4rem 0.9rem; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 8px; font-size: 0.85rem; color: #00d4ff; font-weight: 500; }

    .demo-body { flex: 1; max-width: 900px; margin: 0 auto; padding: 2rem 3rem; width: 100%; }

    .demo-start { text-align: center; margin-bottom: 2rem; }
    .btn-start { padding: 1rem 3rem; font-size: 1.2rem; background: linear-gradient(135deg, #00c853, #00a040); color: #fff; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    .btn-start:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0, 200, 83, 0.3); }
    .btn-start:disabled { opacity: 0.5; cursor: default; transform: none; box-shadow: none; }

    .progress-bar { width: 100%; height: 6px; background: #1e2a4a; border-radius: 3px; margin-bottom: 2rem; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #00d4ff, #00c853); border-radius: 3px; transition: width 0.4s ease; width: 0%; }

    .steps-list { display: flex; flex-direction: column; gap: 1rem; }

    .step-card { background: #111827; border-radius: 12px; padding: 1.25rem 1.5rem; border: 1px solid #1e2a4a; display: flex; gap: 1.25rem; align-items: flex-start; opacity: 0; transform: translateY(12px); transition: all 0.4s ease; }
    .step-card.visible { opacity: 1; transform: translateY(0); }
    .step-card.active { border-color: #00d4ff; box-shadow: 0 0 20px rgba(0, 212, 255, 0.1); }
    .step-card.done { border-color: #1e2a4a; }

    .step-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; background: rgba(0, 212, 255, 0.1); }
    .step-card.done .step-icon { background: rgba(0, 200, 83, 0.15); }

    .step-content { flex: 1; }
    .step-num { font-size: 0.7rem; color: #4a5a7a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; }
    .step-title { font-size: 1.05rem; color: #fff; font-weight: 600; margin-bottom: 0.3rem; }
    .step-detail { font-size: 0.85rem; color: #8892b0; line-height: 1.5; }
    .step-time { font-size: 0.75rem; color: #3a4a6a; margin-top: 0.4rem; }
    .step-data { margin-top: 0.5rem; font-size: 0.75rem; color: #4a6a8a; background: #0d1528; padding: 0.5rem 0.75rem; border-radius: 6px; font-family: monospace; white-space: pre-wrap; max-height: 80px; overflow: hidden; }

    .summary-card { background: linear-gradient(135deg, #111827 0%, #0f1a2e 100%); border-radius: 16px; padding: 2rem; border: 1px solid #00d4ff; margin-top: 2rem; opacity: 0; transform: translateY(12px); transition: all 0.5s ease; }
    .summary-card.visible { opacity: 1; transform: translateY(0); }
    .summary-title { font-size: 1.1rem; color: #00d4ff; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
    .summary-stat { text-align: center; }
    .summary-stat .val { font-size: 2rem; font-weight: 700; color: #fff; }
    .summary-stat .val.green { color: #00c853; }
    .summary-stat .val.blue { color: #00d4ff; }
    .summary-stat .val.purple { color: #a855f7; }
    .summary-stat .lbl { font-size: 0.8rem; color: #6a7a9a; margin-top: 0.25rem; }

    .demo-footer { text-align: center; padding: 1.5rem; color: #3a4a6a; font-size: 0.8rem; border-top: 1px solid #1a2240; }
    .demo-footer a { color: #00aaff; text-decoration: none; }

    @media (max-width: 768px) {
      .demo-header h1 { font-size: 1.5rem; }
      .demo-body { padding: 1.5rem; }
      .summary-grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  </style>
</head>
<body>

  <div class="demo-header">
    <h1><span>Hedera</span> Agent Marketplace</h1>
    <p>Multi-Standard HCS Marketplace for Autonomous AI Agents</p>
    <div class="standards-row">
      <span class="std-badge">HCS-10</span>
      <span class="std-badge">HCS-11</span>
      <span class="std-badge">HCS-14</span>
      <span class="std-badge">HCS-19</span>
      <span class="std-badge">HCS-20</span>
      <span class="std-badge">HCS-26</span>
    </div>
  </div>

  <div class="demo-body">
    <div class="demo-start" id="start-section">
      <button class="btn-start" id="start-btn" onclick="startDemo()">Start Live Demo</button>
    </div>

    <div class="progress-bar" id="progress-bar" style="display:none;">
      <div class="progress-fill" id="progress-fill"></div>
    </div>

    <div class="steps-list" id="steps-list"></div>
    <div class="summary-card" id="summary-card"></div>

    <!-- HCS-26 Skill Registry Demo -->
    <div id="skill-registry-demo" style="margin-top:2.5rem;">
      <h2 style="color:#fff; margin-bottom:0.5rem;">HCS-26 Skill Registry</h2>
      <p style="color:#6a7a9a; margin-bottom:1.5rem; font-size:0.9rem;">Register a skill manifest on the decentralized HCS-26 registry, then query it — all on-chain via Hedera Consensus Service.</p>
      <button class="btn-start" id="skill-demo-btn" onclick="runSkillDemo()" style="padding:0.8rem 2rem; font-size:1rem;">Run Skill Registry Demo</button>
      <div id="skill-demo-steps" style="margin-top:1.5rem;"></div>
      <div id="skill-demo-result" style="margin-top:1rem;"></div>
    </div>
  </div>

  <div class="demo-footer">
    Powered by <a href="https://hedera.com">Hedera</a> &middot; Built by <a href="https://opspawn.com">OpSpawn</a>
  </div>

  <script>
    const STEP_ICONS = { seed: '\\u{1F331}', search: '\\u{1F50D}', select: '\\u{1F3AF}', hire: '\\u{1F4BC}', complete: '\\u{2705}', rate: '\\u{2B50}', points: '\\u{1F3C6}' };
    const STEP_COLORS = { seed: '#00d4ff', search: '#00aaff', select: '#a855f7', hire: '#00c853', complete: '#00c853', rate: '#ffaa00', points: '#a855f7' };
    const TOTAL_STEPS = 7;
    let demoStartTime = 0;
    let renderedSteps = 0;

    async function startDemo() {
      const btn = document.getElementById('start-btn');
      btn.disabled = true;
      btn.textContent = 'Running...';
      document.getElementById('progress-bar').style.display = 'block';
      demoStartTime = Date.now();

      try {
        await fetch('/api/demo/run', { method: 'POST' });
        pollStatus();
      } catch(e) {
        btn.textContent = 'Failed — Retry';
        btn.disabled = false;
      }
    }

    async function pollStatus() {
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
          const res = await fetch('/api/demo/status');
          const state = await res.json();
          const steps = state.steps || [];

          // Render new steps
          for (let j = renderedSteps; j < steps.length; j++) {
            renderStep(steps[j], j === steps.length - 1 && state.status === 'running');
            renderedSteps++;
          }

          // Update progress
          const pct = Math.min(100, Math.round((steps.length / TOTAL_STEPS) * 100));
          document.getElementById('progress-fill').style.width = pct + '%';

          if (state.status === 'completed') {
            // Mark last step as done
            const cards = document.querySelectorAll('.step-card');
            cards.forEach(c => { c.classList.remove('active'); c.classList.add('done'); });
            document.getElementById('progress-fill').style.width = '100%';
            if (state.summary) renderSummary(state.summary);
            document.getElementById('start-btn').textContent = 'Demo Complete';
            return;
          }
          if (state.status === 'failed') {
            document.getElementById('start-btn').textContent = 'Demo Failed';
            document.getElementById('start-btn').disabled = false;
            return;
          }
        } catch(e) {}
      }
    }

    function renderStep(step, isActive) {
      const list = document.getElementById('steps-list');
      const icon = STEP_ICONS[step.type] || '\\u{1F4CC}';
      const elapsed = Date.now() - demoStartTime;

      // Mark previous as done
      const prev = list.querySelectorAll('.step-card.active');
      prev.forEach(c => { c.classList.remove('active'); c.classList.add('done'); });

      const card = document.createElement('div');
      card.className = 'step-card' + (isActive ? ' active' : ' done');
      card.innerHTML =
        '<div class="step-icon">' + icon + '</div>' +
        '<div class="step-content">' +
          '<div class="step-num">Step ' + step.step + ' of ' + TOTAL_STEPS + '</div>' +
          '<div class="step-title">' + esc(step.title) + '</div>' +
          '<div class="step-detail">' + esc(step.detail) + '</div>' +
          '<div class="step-time">+' + elapsed + 'ms</div>' +
          (step.data ? '<div class="step-data">' + esc(JSON.stringify(step.data, null, 2).slice(0, 200)) + '</div>' : '') +
        '</div>';

      list.appendChild(card);
      // Trigger animation
      requestAnimationFrame(() => { card.classList.add('visible'); });
    }

    function renderSummary(s) {
      const el = document.getElementById('summary-card');
      el.innerHTML =
        '<div class="summary-title">Demo Complete</div>' +
        '<div class="summary-grid">' +
          '<div class="summary-stat"><div class="val blue">' + s.totalSteps + '</div><div class="lbl">Steps Executed</div></div>' +
          '<div class="summary-stat"><div class="val green">' + esc(s.selectedAgent) + '</div><div class="lbl">Agent Hired</div></div>' +
          '<div class="summary-stat"><div class="val purple">+' + s.pointsAwarded + '</div><div class="lbl">HCS-20 Points</div></div>' +
        '</div>';
      requestAnimationFrame(() => { el.classList.add('visible'); });
    }

    function esc(str) {
      if (!str) return '';
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }

    // HCS-26 Skill Registry Demo
    async function runSkillDemo() {
      const btn = document.getElementById('skill-demo-btn');
      const stepsDiv = document.getElementById('skill-demo-steps');
      const resultDiv = document.getElementById('skill-demo-result');
      btn.disabled = true;
      btn.textContent = 'Running...';
      stepsDiv.innerHTML = '';
      resultDiv.innerHTML = '';

      function addSkillStep(num, title, detail, ok) {
        const card = document.createElement('div');
        card.className = 'step-card visible done';
        card.innerHTML =
          '<div class="step-icon" style="background:rgba(168,85,247,0.15);">' + (ok ? '\\u{2705}' : '\\u{274C}') + '</div>' +
          '<div class="step-content">' +
            '<div class="step-num">Step ' + num + '</div>' +
            '<div class="step-title">' + esc(title) + '</div>' +
            '<div class="step-detail">' + esc(detail) + '</div>' +
          '</div>';
        stepsDiv.appendChild(card);
      }

      try {
        // Step 1: Publish a skill manifest
        const publishRes = await fetch('/api/skills/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'demo-skill-manifest',
            version: '1.0.0',
            description: 'Demo skill for HCS-26 registry showcase',
            author: 'OpSpawn Demo',
            license: 'MIT',
            skills: [
              { name: 'Sentiment Analysis', description: 'Analyze text sentiment', category: 'nlp' },
              { name: 'Entity Extraction', description: 'Extract entities from text', category: 'nlp' },
            ],
            tags: ['nlp', 'sentiment', 'entities'],
          }),
        });
        const published = await publishRes.json();
        if (publishRes.ok) {
          addSkillStep(1, 'Publish Skill Manifest', 'Published "demo-skill-manifest" to HCS-26 registry (Topic: ' + published.topic_id + ')', true);
        } else {
          addSkillStep(1, 'Publish Skill Manifest', 'Failed: ' + (published.message || 'Unknown error'), false);
        }

        // Step 2: Query the skill by topic
        if (published.topic_id) {
          const lookupRes = await fetch('/api/skills/' + encodeURIComponent(published.topic_id));
          const skill = await lookupRes.json();
          if (lookupRes.ok) {
            addSkillStep(2, 'Lookup Skill by Topic', 'Found skill "' + skill.manifest.name + '" with ' + skill.manifest.skills.length + ' skill definitions', true);
          } else {
            addSkillStep(2, 'Lookup Skill by Topic', 'Not found', false);
          }
        }

        // Step 3: Search skills
        const searchRes = await fetch('/api/skills/search?q=sentiment');
        const searchData = await searchRes.json();
        addSkillStep(3, 'Search Skills', 'Found ' + searchData.results.length + ' skill(s) matching "sentiment"', searchData.results.length > 0);

        resultDiv.innerHTML =
          '<div style="background:#111827; padding:1.25rem; border-radius:12px; border:1px solid rgba(168,85,247,0.3); margin-top:1rem;">' +
            '<div style="color:#a855f7; font-weight:600; margin-bottom:0.5rem;">Skill Registry Demo Complete</div>' +
            '<div style="color:#8892b0; font-size:0.85rem;">Published manifest with topic ' + esc(published.topic_id) + ', verified lookup, and searched registry.</div>' +
          '</div>';
      } catch(e) {
        resultDiv.innerHTML = '<div style="color:#ff4444;">Skill registry demo failed</div>';
      }

      btn.disabled = false;
      btn.textContent = 'Run Skill Registry Demo';
    }

    // Auto-start if ?auto=1 query param
    if (new URLSearchParams(window.location.search).get('auto') === '1') {
      setTimeout(startDemo, 500);
    }
  </script>
</body>
</html>`;
}

function getDemoWalkthroughHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hedera Agent Marketplace — Demo Walkthrough</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080c14; color: #e0e0e0; min-height: 100vh; }

    .wt-header { background: linear-gradient(135deg, #0d1528 0%, #131b30 50%, #0f1a2e 100%); padding: 2.5rem 3rem; border-bottom: 1px solid #1e2a4a; text-align: center; }
    .wt-header h1 { font-size: 2.2rem; color: #fff; margin-bottom: 0.5rem; }
    .wt-header h1 span { color: #00d4ff; }
    .wt-header p { color: #6a7a9a; font-size: 1rem; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .standards-bar { display: flex; justify-content: center; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
    .std-pill { padding: 0.35rem 0.8rem; background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); border-radius: 20px; font-size: 0.8rem; color: #00d4ff; font-weight: 500; }

    .wt-body { max-width: 960px; margin: 0 auto; padding: 2rem 2rem 4rem; }

    .scene-card { background: #111827; border-radius: 16px; border: 1px solid #1e2a4a; margin-bottom: 2rem; overflow: hidden; transition: border-color 0.3s; }
    .scene-card:hover { border-color: rgba(0,212,255,0.4); }

    .scene-header { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #1a2240; }
    .scene-num { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #0088cc, #00aaff); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; color: #fff; flex-shrink: 0; }
    .scene-title-area { flex: 1; }
    .scene-title { font-size: 1.15rem; color: #fff; font-weight: 600; }
    .scene-duration { font-size: 0.75rem; color: #4a5a7a; margin-top: 0.15rem; }
    .scene-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .scene-badge { padding: 0.2rem 0.55rem; background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.25); border-radius: 6px; font-size: 0.7rem; color: #00d4ff; font-weight: 500; }

    .scene-body { padding: 1.5rem; }
    .scene-desc { color: #8892b0; font-size: 0.9rem; line-height: 1.6; margin-bottom: 1rem; }

    .scene-narration { background: #0d1528; border-left: 3px solid #00d4ff; padding: 0.75rem 1rem; border-radius: 0 8px 8px 0; margin-bottom: 1rem; }
    .scene-narration-label { font-size: 0.7rem; color: #00d4ff; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.25rem; font-weight: 600; }
    .scene-narration-text { font-size: 0.85rem; color: #a0b0d0; line-height: 1.5; font-style: italic; }

    .scene-standards { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .std-detail { display: flex; align-items: center; gap: 0.4rem; background: rgba(0,212,255,0.05); padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid #1e2a4a; }
    .std-detail .dot { width: 6px; height: 6px; border-radius: 50%; background: #00d4ff; }
    .std-detail .label { font-size: 0.75rem; color: #6a8ab0; }

    .scene-screenshot { margin-top: 1rem; background: #0d1528; border-radius: 10px; padding: 1rem; border: 1px solid #1a2240; text-align: center; }
    .scene-screenshot-placeholder { color: #3a4a6a; font-size: 0.8rem; padding: 2rem; }

    .wt-timeline { display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .tl-dot { width: 36px; height: 36px; border-radius: 50%; background: #1e2a4a; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #6a7a9a; cursor: pointer; transition: all 0.2s; }
    .tl-dot:hover { background: rgba(0,212,255,0.2); color: #00d4ff; }

    .wt-summary { background: linear-gradient(135deg, #111827, #0f1a2e); border: 1px solid #00d4ff; border-radius: 16px; padding: 2rem; text-align: center; margin-top: 2rem; }
    .wt-summary h2 { color: #00d4ff; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1.25rem; }
    .wt-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
    .wt-stat .val { font-size: 2rem; font-weight: 700; color: #fff; }
    .wt-stat .val.blue { color: #00d4ff; }
    .wt-stat .val.green { color: #00c853; }
    .wt-stat .val.purple { color: #a855f7; }
    .wt-stat .lbl { font-size: 0.75rem; color: #6a7a9a; margin-top: 0.2rem; }

    .wt-actions { text-align: center; margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .wt-btn { padding: 0.8rem 2rem; border-radius: 10px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-block; }
    .wt-btn-primary { background: linear-gradient(135deg, #00c853, #00a040); color: #fff; }
    .wt-btn-primary:hover { box-shadow: 0 4px 20px rgba(0,200,83,0.3); transform: translateY(-1px); }
    .wt-btn-secondary { background: #1e2a4a; color: #a0b0d0; border: 1px solid #2a3a5a; }
    .wt-btn-secondary:hover { background: #2a3a5a; }

    .wt-footer { text-align: center; padding: 2rem; color: #3a4a6a; font-size: 0.8rem; border-top: 1px solid #1a2240; margin-top: 3rem; }
    .wt-footer a { color: #00aaff; text-decoration: none; }

    @media (max-width: 768px) {
      .wt-header h1 { font-size: 1.6rem; }
      .wt-body { padding: 1.5rem 1rem; }
      .wt-summary-grid { grid-template-columns: repeat(2, 1fr); }
      .scene-header { flex-wrap: wrap; }
    }
  </style>
</head>
<body>

  <div class="wt-header">
    <h1><span>Hedera</span> Agent Marketplace</h1>
    <p>Scene-by-scene walkthrough of the complete marketplace demo flow. Each scene demonstrates specific HCS standards in action.</p>
    <div class="standards-bar">
      <span class="std-pill">HCS-10 Messaging</span>
      <span class="std-pill">HCS-11 Profiles</span>
      <span class="std-pill">HCS-14 Identity</span>
      <span class="std-pill">HCS-19 Privacy</span>
      <span class="std-pill">HCS-20 Reputation</span>
      <span class="std-pill">HCS-26 Skills</span>
    </div>
  </div>

  <div class="wt-body">

    <div class="wt-timeline">
      <div class="tl-dot" onclick="scrollToScene(1)">1</div>
      <div class="tl-dot" onclick="scrollToScene(2)">2</div>
      <div class="tl-dot" onclick="scrollToScene(3)">3</div>
      <div class="tl-dot" onclick="scrollToScene(4)">4</div>
      <div class="tl-dot" onclick="scrollToScene(5)">5</div>
      <div class="tl-dot" onclick="scrollToScene(6)">6</div>
      <div class="tl-dot" onclick="scrollToScene(7)">7</div>
    </div>

    <div id="scene-1" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">1</div>
        <div class="scene-title-area">
          <div class="scene-title">Marketplace Overview</div>
          <div class="scene-duration">~25s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-10</span>
          <span class="scene-badge">HCS-11</span>
          <span class="scene-badge">HCS-14</span>
          <span class="scene-badge">HCS-19</span>
          <span class="scene-badge">HCS-20</span>
          <span class="scene-badge">HCS-26</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Dashboard landing page showing live agent count, all 6 HCS standards, and real-time status. This establishes the scope of the project — a complete multi-standard marketplace.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">The Hedera Agent Marketplace is a decentralized platform for AI agent discovery, hiring, and reputation tracking — built on 6 HCS standards.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">All 6 standards active</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Real-time dashboard</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Testnet connected</span></div>
        </div>
      </div>
    </div>

    <div id="scene-2" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">2</div>
        <div class="scene-title-area">
          <div class="scene-title">Seed Demo Agents</div>
          <div class="scene-duration">~30s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-10</span>
          <span class="scene-badge">HCS-11</span>
          <span class="scene-badge">HCS-14</span>
          <span class="scene-badge">HCS-19</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Register 8 demo agents with full HCS identities. Each agent gets HCS-10 communication topics, HCS-11 profiles, HCS-14 DID documents, and HCS-19 privacy consent records.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">8 demo agents are registered with full HCS-10 communication topics, HCS-11 profiles, HCS-14 DID identities, and HCS-19 privacy consent.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-10 inbound/outbound topics</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-11 structured profiles</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-14 DID documents</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-19 ISO 27560 consent</span></div>
        </div>
      </div>
    </div>

    <div id="scene-3" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">3</div>
        <div class="scene-title-area">
          <div class="scene-title">Browse & Search Marketplace</div>
          <div class="scene-duration">~25s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-10</span>
          <span class="scene-badge">HCS-26</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Search and discover agents by skill, category, or reputation score using full-text search. Agent cards show verified status, skills, and reputation badges.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">Agents are discoverable by name, skill, category, or reputation. The marketplace uses HCS-26 skill manifests for structured capability data.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">Full-text search</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Category filters</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Reputation ranking</span></div>
        </div>
      </div>
    </div>

    <div id="scene-4" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">4</div>
        <div class="scene-title-area">
          <div class="scene-title">Agent Profile Detail</div>
          <div class="scene-duration">~25s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-11</span>
          <span class="scene-badge">HCS-19</span>
          <span class="scene-badge">HCS-26</span>
          <span class="scene-badge">HCS-20</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Full agent profile showing HCS-11 structured data, HCS-19 verified identity with DID, HCS-26 published skills with pricing, and HCS-20 reputation points.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">Each agent has a complete profile showing HCS-11 structured data, HCS-19 verified identity with DID, HCS-26 published skills, and HCS-20 reputation points.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-11 profile data</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-19 verified identity</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-26 skill manifests</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-20 reputation points</span></div>
        </div>
      </div>
    </div>

    <div id="scene-5" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">5</div>
        <div class="scene-title-area">
          <div class="scene-title">Hire Agent for Task</div>
          <div class="scene-duration">~30s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-10</span>
          <span class="scene-badge">HCS-14</span>
          <span class="scene-badge">HCS-20</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Select an agent skill and submit a task. The hiring flow creates a task via HCS-10 messaging, verifies HCS-14 DID identity, and initiates payment settlement.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">The hiring flow creates a task via HCS-10 messaging, verifies the agent's HCS-14 DID identity, and initiates payment settlement.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-10 task messaging</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-14 DID verification</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Payment settlement</span></div>
        </div>
      </div>
    </div>

    <div id="scene-6" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">6</div>
        <div class="scene-title-area">
          <div class="scene-title">Task Completion</div>
          <div class="scene-duration">~25s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-10</span>
          <span class="scene-badge">HCS-20</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Agent completes the task and delivers results via its HCS-10 outbound topic. Task completion triggers 100 HCS-20 reputation points.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">The agent delivers results via its HCS-10 outbound topic. Task completion triggers 100 HCS-20 reputation points.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">HCS-10 result delivery</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">+100 HCS-20 points</span></div>
        </div>
      </div>
    </div>

    <div id="scene-7" class="scene-card">
      <div class="scene-header">
        <div class="scene-num">7</div>
        <div class="scene-title-area">
          <div class="scene-title">Rating & Points</div>
          <div class="scene-duration">~30s</div>
        </div>
        <div class="scene-badges">
          <span class="scene-badge">HCS-20</span>
        </div>
      </div>
      <div class="scene-body">
        <div class="scene-desc">Rate the agent 5 stars and view the HCS-20 reputation leaderboard. A 5-star rating awards 50 bonus points, bringing the total to 150 HCS-20 points.</div>
        <div class="scene-narration">
          <div class="scene-narration-label">Narration</div>
          <div class="scene-narration-text">A 5-star rating awards 50 bonus HCS-20 points, bringing the total to 150. The reputation leaderboard updates in real time.</div>
        </div>
        <div class="scene-standards">
          <div class="std-detail"><div class="dot"></div><span class="label">5-star rating</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">+50 bonus points</span></div>
          <div class="std-detail"><div class="dot"></div><span class="label">Real-time leaderboard</span></div>
        </div>
      </div>
    </div>

    <div class="wt-summary">
      <h2>Demo Summary</h2>
      <div class="wt-summary-grid">
        <div class="wt-stat"><div class="val blue">7</div><div class="lbl">Scenes</div></div>
        <div class="wt-stat"><div class="val green">6</div><div class="lbl">HCS Standards</div></div>
        <div class="wt-stat"><div class="val purple">150</div><div class="lbl">Points Awarded</div></div>
        <div class="wt-stat"><div class="val">~3 min</div><div class="lbl">Est. Duration</div></div>
      </div>
    </div>

    <div class="wt-actions">
      <a href="/demo?auto=1" class="wt-btn wt-btn-primary">Run Live Demo</a>
      <a href="/" class="wt-btn wt-btn-secondary">Back to Marketplace</a>
    </div>
  </div>

  <div class="wt-footer">
    Powered by <a href="https://hedera.com">Hedera</a> &middot; HCS-10 &middot; HCS-11 &middot; HCS-14 &middot; HCS-19 &middot; HCS-20 &middot; HCS-26 &middot; Built by <a href="https://opspawn.com">OpSpawn</a>
  </div>

  <script>
    function scrollToScene(num) {
      const el = document.getElementById('scene-' + num);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  </script>
</body>
</html>`;
}

function getDemoFlowHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo Flow — Hedera Agent Marketplace</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080c14; color: #e0e0e0; min-height: 100vh; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

    .header { background: linear-gradient(135deg, #0a1628 0%, #0d2137 100%); border-bottom: 1px solid #1a3a5c; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { font-size: 22px; font-weight: 700; background: linear-gradient(135deg, #4fc3f7, #00e676); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header .badge { background: #1a3a5c; color: #4fc3f7; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .header nav a { color: #4fc3f7; text-decoration: none; margin-left: 16px; font-size: 14px; opacity: 0.8; }
    .header nav a:hover { opacity: 1; }

    .container { max-width: 960px; margin: 0 auto; padding: 32px 24px; }

    .hero { text-align: center; margin-bottom: 32px; }
    .hero h2 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .hero p { color: #90a4ae; font-size: 15px; max-width: 640px; margin: 0 auto; }

    .run-btn { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #00c853, #00e676); color: #080c14; border: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .run-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0, 230, 118, 0.3); }
    .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .run-btn .spinner { display: none; width: 18px; height: 18px; border: 2px solid rgba(0,0,0,0.2); border-top-color: #080c14; border-radius: 50%; animation: spin 0.7s linear infinite; }
    .run-btn.loading .spinner { display: inline-block; }
    .run-btn.loading .btn-text { display: none; }

    .steps-container { margin-top: 32px; }
    .step-card { background: #0d1b2a; border: 1px solid #1a3a5c; border-radius: 10px; padding: 20px 24px; margin-bottom: 12px; animation: fadeInUp 0.4s ease; position: relative; overflow: hidden; }
    .step-card.completed { border-color: #00c853; }
    .step-card.failed { border-color: #ff5252; }
    .step-card.running { border-color: #ffc107; }
    .step-card.running::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #ffc107, transparent); animation: pulse 1.5s ease-in-out infinite; }

    .step-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
    .step-card.completed .step-num { background: #00c853; color: #080c14; }
    .step-card.failed .step-num { background: #ff5252; color: #fff; }
    .step-card.running .step-num { background: #ffc107; color: #080c14; }
    .step-card.pending .step-num { background: #263238; color: #546e7a; }
    .step-title { font-size: 15px; font-weight: 600; }
    .step-phase { font-size: 11px; color: #4fc3f7; background: rgba(79,195,247,0.1); padding: 2px 8px; border-radius: 4px; margin-left: auto; }
    .step-duration { font-size: 12px; color: #78909c; margin-left: 8px; }

    .step-detail { font-size: 13px; color: #b0bec5; margin-left: 40px; line-height: 1.5; }
    .step-data { margin-top: 8px; margin-left: 40px; background: #0a1628; border-radius: 6px; padding: 10px 14px; font-family: 'SF Mono', monospace; font-size: 12px; color: #78909c; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
    .step-error { margin-top: 8px; margin-left: 40px; color: #ff5252; font-size: 13px; }

    .step-retry { margin-left: 40px; margin-top: 8px; }
    .step-retry button { background: rgba(255,82,82,0.15); border: 1px solid #ff5252; color: #ff5252; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .step-retry button:hover { background: rgba(255,82,82,0.25); }

    .summary-card { background: linear-gradient(135deg, #0d1b2a, #0a2540); border: 1px solid #1a3a5c; border-radius: 12px; padding: 24px; margin-top: 24px; animation: fadeInUp 0.5s ease; }
    .summary-card h3 { font-size: 18px; margin-bottom: 16px; color: #4fc3f7; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .summary-stat { background: rgba(79,195,247,0.06); border-radius: 8px; padding: 12px; text-align: center; }
    .summary-stat .val { font-size: 24px; font-weight: 700; color: #00e676; }
    .summary-stat .label { font-size: 12px; color: #78909c; margin-top: 4px; }
    .summary-stat.fail .val { color: #ff5252; }

    .timing-bar { margin-top: 24px; }
    .timing-bar h4 { font-size: 14px; color: #78909c; margin-bottom: 8px; }
    .timing-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .timing-label { font-size: 12px; color: #b0bec5; width: 120px; flex-shrink: 0; }
    .timing-track { flex: 1; height: 8px; background: #1a3a5c; border-radius: 4px; overflow: hidden; }
    .timing-fill { height: 100%; background: linear-gradient(90deg, #00c853, #4fc3f7); border-radius: 4px; transition: width 0.5s ease; }
    .timing-ms { font-size: 12px; color: #78909c; width: 60px; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; align-items: center; gap: 12px;">
      <h1>Hedera Agent Marketplace</h1>
      <span class="badge">v0.24.0</span>
    </div>
    <nav>
      <a href="/">Dashboard</a>
      <a href="/demo">Demo</a>
      <a href="/demo-flow">Full Flow</a>
      <a href="/health">Health</a>
    </nav>
  </div>

  <div class="container">
    <div class="hero">
      <h2>End-to-End Demo Flow</h2>
      <p>Run the complete marketplace pipeline: agent registration, skill publishing, discovery, connection, task execution, and feedback — all in one click.</p>
    </div>

    <div style="text-align: center; margin-bottom: 16px;">
      <button class="run-btn" id="runBtn" onclick="runFullFlow()">
        <span class="btn-text">Run Full Demo</span>
        <span class="spinner"></span>
      </button>
    </div>

    <div class="steps-container" id="stepsContainer"></div>
    <div id="summaryContainer"></div>
    <div id="timingContainer"></div>
  </div>

  <script>
    let isRunning = false;

    async function runFullFlow() {
      if (isRunning) return;
      isRunning = true;

      const btn = document.getElementById('runBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      const stepsEl = document.getElementById('stepsContainer');
      const summaryEl = document.getElementById('summaryContainer');
      const timingEl = document.getElementById('timingContainer');
      stepsEl.innerHTML = '';
      summaryEl.innerHTML = '';
      timingEl.innerHTML = '';

      // Show placeholder pending steps
      const phases = [
        { phase: 'registration', title: 'Register Agent (HCS-19 Identity)' },
        { phase: 'skills', title: 'Publish Skills (HCS-26)' },
        { phase: 'discovery', title: 'Discover Agents (Registry Broker)' },
        { phase: 'connection', title: 'Connect Agents (HCS-10)' },
        { phase: 'execution', title: 'Execute Task (Chat Relay)' },
        { phase: 'feedback', title: 'Submit Feedback (HCS-20 Points)' },
      ];

      phases.forEach((p, i) => {
        stepsEl.innerHTML += buildStepCard({
          step: i + 1, phase: p.phase, title: p.title,
          status: i === 0 ? 'running' : 'pending',
          detail: i === 0 ? 'Executing...' : 'Waiting...',
          duration_ms: 0,
        });
      });

      try {
        const resp = await fetch('/api/demo/full-flow', { method: 'POST' });
        const data = await resp.json();

        stepsEl.innerHTML = '';
        if (data.steps) {
          data.steps.forEach(s => {
            stepsEl.innerHTML += buildStepCard(s);
          });
        }

        if (data.summary) {
          summaryEl.innerHTML = buildSummary(data);
        }

        if (data.steps && data.steps.length > 0) {
          timingEl.innerHTML = buildTimingChart(data.steps, data.total_duration_ms);
        }
      } catch (err) {
        stepsEl.innerHTML = '<div class="step-card failed"><div class="step-header"><div class="step-num">!</div><div class="step-title">Request Failed</div></div><div class="step-error">' + err.message + '</div></div>';
      }

      btn.classList.remove('loading');
      btn.disabled = false;
      isRunning = false;
    }

    function buildStepCard(s) {
      const statusClass = s.status || 'pending';
      let html = '<div class="step-card ' + statusClass + '">';
      html += '<div class="step-header">';
      html += '<div class="step-num">' + (s.status === 'completed' ? '&#10003;' : s.status === 'failed' ? '&#10007;' : s.step) + '</div>';
      html += '<div class="step-title">' + esc(s.title) + '</div>';
      html += '<span class="step-phase">' + esc(s.phase) + '</span>';
      if (s.duration_ms > 0) {
        html += '<span class="step-duration">' + s.duration_ms + 'ms</span>';
      }
      html += '</div>';

      if (s.detail) {
        html += '<div class="step-detail">' + esc(s.detail) + '</div>';
      }

      if (s.data && Object.keys(s.data).length > 0) {
        html += '<div class="step-data">' + esc(JSON.stringify(s.data, null, 2)) + '</div>';
      }

      if (s.error) {
        html += '<div class="step-error">' + esc(s.error) + '</div>';
      }

      html += '</div>';
      return html;
    }

    function buildSummary(data) {
      const s = data.summary;
      let html = '<div class="summary-card"><h3>Flow Summary</h3>';
      html += '<div class="summary-grid">';
      html += stat(s.completed_steps + '/' + s.total_steps, 'Steps Completed', s.failed_steps > 0);
      html += stat(s.agent_registered || 'N/A', 'Agent Registered');
      html += stat(s.skills_published, 'Skills Published');
      html += stat(s.agents_discovered, 'Agents Discovered');
      html += stat(s.connection_established ? 'Yes' : 'No', 'HCS-10 Connected');
      html += stat(s.chat_relayed ? 'Yes' : 'No', 'Chat Relayed');
      html += stat(s.feedback_submitted ? 'Yes' : 'No', 'Feedback Submitted');
      html += stat(data.total_duration_ms + 'ms', 'Total Duration');
      html += '</div></div>';
      return html;
    }

    function stat(val, label, isFail) {
      return '<div class="summary-stat' + (isFail ? ' fail' : '') + '"><div class="val">' + esc(String(val)) + '</div><div class="label">' + esc(label) + '</div></div>';
    }

    function buildTimingChart(steps, totalMs) {
      if (!totalMs || totalMs === 0) return '';
      let html = '<div class="timing-bar"><h4>Step Timing</h4>';
      steps.forEach(s => {
        const pct = Math.max(2, Math.round((s.duration_ms / totalMs) * 100));
        html += '<div class="timing-row">';
        html += '<div class="timing-label">' + esc(s.phase) + '</div>';
        html += '<div class="timing-track"><div class="timing-fill" style="width:' + pct + '%"></div></div>';
        html += '<div class="timing-ms">' + s.duration_ms + 'ms</div>';
        html += '</div>';
      });
      html += '</div>';
      return html;
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }
  </script>
</body>
</html>`;
}
