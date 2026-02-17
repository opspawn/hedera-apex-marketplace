/**
 * Text Overlay System for Demo Video
 *
 * Generates CSS-based text overlays for Playwright screenshots.
 * Each overlay is injected as a DOM element positioned absolutely
 * over the page content before screenshot capture.
 *
 * Overlay types:
 * - title: Large white text with drop shadow (scene titles)
 * - subtitle: Medium gray text (descriptions)
 * - badge: Rounded pill with accent color (HCS standard labels)
 * - caption: Small text at bottom (narration/captions)
 */

import { TextOverlay } from './scene-definitions';

export interface OverlayConfig {
  overlays: TextOverlay[];
  containerWidth: number;
  containerHeight: number;
}

/**
 * Generate the CSS + HTML for a set of text overlays.
 * Returns injectable HTML that can be added to a page via Playwright.
 */
export function generateOverlayHTML(config: OverlayConfig): string {
  const { overlays, containerWidth, containerHeight } = config;

  const overlayElements = overlays.map((overlay, idx) => {
    const posStyle = getPositionCSS(overlay.position);
    const typeStyle = getTypeCSS(overlay.style);
    return `<div id="demo-overlay-${idx}" style="${posStyle}${typeStyle}">${escapeHTML(overlay.text)}</div>`;
  }).join('\n');

  return `
<div id="demo-overlay-container" style="
  position: fixed;
  top: 0; left: 0;
  width: ${containerWidth}px;
  height: ${containerHeight}px;
  z-index: 99999;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
">
${overlayElements}
</div>`;
}

/**
 * Generate a Playwright script snippet that injects overlays into the page.
 */
export function generateOverlayInjectionScript(config: OverlayConfig): string {
  const html = generateOverlayHTML(config).replace(/\n/g, '').replace(/"/g, '\\"');
  return `document.body.insertAdjacentHTML('beforeend', "${html}");`;
}

/**
 * Generate a Playwright script to remove all overlays.
 */
export function generateOverlayRemovalScript(): string {
  return `const el = document.getElementById('demo-overlay-container'); if (el) el.remove();`;
}

function getPositionCSS(position: TextOverlay['position']): string {
  const base = 'position: absolute; ';
  switch (position) {
    case 'top-left':
      return base + 'top: 24px; left: 32px; ';
    case 'top-center':
      return base + 'top: 24px; left: 50%; transform: translateX(-50%); text-align: center; ';
    case 'top-right':
      return base + 'top: 24px; right: 32px; ';
    case 'bottom-left':
      return base + 'bottom: 24px; left: 32px; ';
    case 'bottom-center':
      return base + 'bottom: 24px; left: 50%; transform: translateX(-50%); text-align: center; white-space: nowrap; ';
    case 'bottom-right':
      return base + 'bottom: 24px; right: 32px; ';
    case 'center':
      return base + 'top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; ';
    default:
      return base + 'top: 24px; left: 32px; ';
  }
}

function getTypeCSS(style: TextOverlay['style']): string {
  switch (style) {
    case 'title':
      return 'font-size: 28px; font-weight: 700; color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.4); letter-spacing: -0.02em; ';
    case 'subtitle':
      return 'font-size: 16px; font-weight: 400; color: rgba(255,255,255,0.85); text-shadow: 0 1px 4px rgba(0,0,0,0.8); letter-spacing: 0.01em; ';
    case 'badge':
      return 'font-size: 13px; font-weight: 600; color: #00d4ff; background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.4); padding: 6px 14px; border-radius: 20px; backdrop-filter: blur(4px); ';
    case 'caption':
      return 'font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.7); text-shadow: 0 1px 3px rgba(0,0,0,0.9); max-width: 80%; ';
    default:
      return 'font-size: 16px; color: #ffffff; ';
  }
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Get overlay style class names for CSS-in-HTML approach (used by demo page).
 */
export function getOverlayStylesheet(): string {
  return `
.demo-overlay-title {
  font-size: 28px; font-weight: 700; color: #ffffff;
  text-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.4);
  letter-spacing: -0.02em;
}
.demo-overlay-subtitle {
  font-size: 16px; font-weight: 400; color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
}
.demo-overlay-badge {
  font-size: 13px; font-weight: 600; color: #00d4ff;
  background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.4);
  padding: 6px 14px; border-radius: 20px; display: inline-block;
}
.demo-overlay-caption {
  font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.7);
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
}`;
}
