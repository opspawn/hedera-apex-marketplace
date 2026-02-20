#!/usr/bin/env node
import { chromium } from '@playwright/test';

const [,, htmlPath, pdfPath] = process.argv;

if (!htmlPath || !pdfPath) {
  console.error('Usage: html-to-pdf.mjs <html-path> <pdf-path>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.pdf({ path: pdfPath, format: 'A4', landscape: true, printBackground: true });
await browser.close();

console.log(`PDF generated: ${pdfPath}`);
