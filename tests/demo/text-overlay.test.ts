/**
 * Tests for text overlay system.
 */

import {
  generateOverlayHTML,
  generateOverlayInjectionScript,
  generateOverlayRemovalScript,
  getOverlayStylesheet,
  OverlayConfig,
} from '../../src/demo/text-overlay';
import { TextOverlay } from '../../src/demo/scene-definitions';

describe('Text Overlay System', () => {
  const sampleOverlays: TextOverlay[] = [
    { text: 'Test Title', position: 'top-center', style: 'title' },
    { text: 'Test Subtitle', position: 'bottom-center', style: 'subtitle' },
    { text: 'HCS-10', position: 'top-right', style: 'badge' },
  ];

  const sampleConfig: OverlayConfig = {
    overlays: sampleOverlays,
    containerWidth: 1920,
    containerHeight: 1080,
  };

  describe('generateOverlayHTML', () => {
    it('should return HTML string with container div', () => {
      const html = generateOverlayHTML(sampleConfig);
      expect(html).toContain('demo-overlay-container');
      expect(html).toContain('1920px');
      expect(html).toContain('1080px');
    });

    it('should include all overlay elements', () => {
      const html = generateOverlayHTML(sampleConfig);
      expect(html).toContain('demo-overlay-0');
      expect(html).toContain('demo-overlay-1');
      expect(html).toContain('demo-overlay-2');
    });

    it('should include overlay text', () => {
      const html = generateOverlayHTML(sampleConfig);
      expect(html).toContain('Test Title');
      expect(html).toContain('Test Subtitle');
      expect(html).toContain('HCS-10');
    });

    it('should escape HTML in overlay text', () => {
      const config: OverlayConfig = {
        overlays: [{ text: '<script>alert("xss")</script>', position: 'top-center', style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should set z-index to 99999 for overlay container', () => {
      const html = generateOverlayHTML(sampleConfig);
      expect(html).toContain('z-index: 99999');
    });

    it('should set pointer-events to none', () => {
      const html = generateOverlayHTML(sampleConfig);
      expect(html).toContain('pointer-events: none');
    });

    it('should handle empty overlays array', () => {
      const config: OverlayConfig = { overlays: [], containerWidth: 1920, containerHeight: 1080 };
      const html = generateOverlayHTML(config);
      expect(html).toContain('demo-overlay-container');
      expect(html).not.toContain('demo-overlay-0');
    });
  });

  describe('overlay positions', () => {
    const positions: TextOverlay['position'][] = [
      'top-left', 'top-center', 'top-right',
      'bottom-left', 'bottom-center', 'bottom-right',
      'center',
    ];

    it.each(positions)('should generate CSS for position: %s', (position) => {
      const config: OverlayConfig = {
        overlays: [{ text: 'Test', position, style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('position: absolute');
      expect(html).toContain('Test');
    });

    it('top-left should include top and left', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'TL', position: 'top-left', style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('top:');
      expect(html).toContain('left:');
    });

    it('bottom-right should include bottom and right', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'BR', position: 'bottom-right', style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('bottom:');
      expect(html).toContain('right:');
    });

    it('center should include transform: translate', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'C', position: 'center', style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('translate(-50%, -50%)');
    });
  });

  describe('overlay styles', () => {
    it('title style should have large font and drop shadow', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'Title', position: 'top-center', style: 'title' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('font-size: 28px');
      expect(html).toContain('font-weight: 700');
      expect(html).toContain('text-shadow');
    });

    it('subtitle style should have medium font', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'Sub', position: 'bottom-center', style: 'subtitle' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('font-size: 16px');
    });

    it('badge style should have accent color and border-radius', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'Badge', position: 'top-right', style: 'badge' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('#00d4ff');
      expect(html).toContain('border-radius: 20px');
    });

    it('caption style should have small font', () => {
      const config: OverlayConfig = {
        overlays: [{ text: 'Caption text', position: 'bottom-left', style: 'caption' }],
        containerWidth: 1920,
        containerHeight: 1080,
      };
      const html = generateOverlayHTML(config);
      expect(html).toContain('font-size: 14px');
    });
  });

  describe('generateOverlayInjectionScript', () => {
    it('should return a JavaScript string', () => {
      const script = generateOverlayInjectionScript(sampleConfig);
      expect(typeof script).toBe('string');
      expect(script).toContain('insertAdjacentHTML');
    });

    it('should contain overlay HTML as escaped string', () => {
      const script = generateOverlayInjectionScript(sampleConfig);
      expect(script).toContain('demo-overlay-container');
      expect(script).toContain('Test Title');
    });

    it('should use beforeend insertion point', () => {
      const script = generateOverlayInjectionScript(sampleConfig);
      expect(script).toContain('beforeend');
    });
  });

  describe('generateOverlayRemovalScript', () => {
    it('should return a script that removes the container', () => {
      const script = generateOverlayRemovalScript();
      expect(script).toContain('demo-overlay-container');
      expect(script).toContain('remove()');
    });

    it('should safely handle missing container', () => {
      const script = generateOverlayRemovalScript();
      expect(script).toContain('if (el)');
    });
  });

  describe('getOverlayStylesheet', () => {
    it('should return CSS string with all style classes', () => {
      const css = getOverlayStylesheet();
      expect(css).toContain('.demo-overlay-title');
      expect(css).toContain('.demo-overlay-subtitle');
      expect(css).toContain('.demo-overlay-badge');
      expect(css).toContain('.demo-overlay-caption');
    });

    it('should include proper styling for title class', () => {
      const css = getOverlayStylesheet();
      expect(css).toContain('font-size: 28px');
      expect(css).toContain('font-weight: 700');
    });

    it('should include badge accent color', () => {
      const css = getOverlayStylesheet();
      expect(css).toContain('#00d4ff');
    });
  });
});
