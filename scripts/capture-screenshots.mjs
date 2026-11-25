import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const assetsDir = path.join(repoRoot, 'docs', 'assets');
const framesDir = process.env.SYSTEMLAB_DEMO_FRAMES_DIR
  ? path.resolve(process.env.SYSTEMLAB_DEMO_FRAMES_DIR)
  : path.join(os.tmpdir(), 'systemlab-demo-frames');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    const relPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const filePath = path.resolve(rootDir, relPath);
    if (
      !filePath.startsWith(rootDir) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

async function dismissTutorial(page) {
  const btn = page.getByRole('button', { name: /dismiss tutorial/i });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

async function openScenarioByTitle(page, title) {
  await page.getByRole('button', { name: /^Scenarios$/i }).click();
  await page.getByText(title).first().waitFor({ state: 'visible', timeout: 8000 });
  const card = page.locator('article').filter({ hasText: title }).first();
  await card.getByRole('button', { name: /open in workspace/i }).click();
  await page.waitForTimeout(350);
}

async function runFastToCompletion(page) {
  await page.getByRole('tab', { name: /overview/i }).click();
  await page.getByLabel(/playback speed/i).selectOption('100');
  await page.getByRole('button', { name: /run simulation/i }).click();
  await page.getByText(/Conservation:/i).waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
}

async function main() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html missing. Run `npm run build` before capturing screenshots.');
  }
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const { server, url } = await startStaticServer(distDir);
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
  const browser = await chromium.launch({ channel, headless: true });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    // 1. Desktop 1440x900 high-resolution product & VCraft screenshots
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(url, { waitUntil: 'networkidle' });
    await dismissTutorial(page);

    // Core 03 Caching Fundamentals -> overview + charts
    await openScenarioByTitle(page, 'Caching Fundamentals');
    await runFastToCompletion(page);
    await page.screenshot({ path: path.join(assetsDir, 'workspace-overview.png') });

    await page.getByRole('tab', { name: /charts/i }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(assetsDir, 'monitoring-charts.png') });

    // Chaos Lab active node_failure fault on Server Failure & Recovery
    await openScenarioByTitle(page, 'Server Failure & Recovery');
    await page.getByRole('tab', { name: /chaos lab/i }).click();
    await page.getByLabel(/playback speed/i).selectOption('2');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /pause simulation/i }).click();
    await page.getByLabel(/fault type/i).selectOption('node_failure');
    await page.getByLabel(/target component/i).selectOption('app-1');
    await page.getByRole('button', { name: /inject live fault/i }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(assetsDir, 'chaos-lab-fault.png') });

    // Core Experiment Comparison (01 Hello System Design: 15 RPS vs 40 RPS)
    await openScenarioByTitle(page, 'Hello, System Design');
    await runFastToCompletion(page);
    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Baseline 15 RPS');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await page.getByTestId('canvas-node-client-1').click();
    await page.getByLabel(/request rate/i).fill('40');
    await page.getByRole('button', { name: /reset simulation/i }).click();
    await runFastToCompletion(page);
    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Higher Load 40 RPS');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(assetsDir, 'experiment-comparison.png') });

    // Clean fresh context for VCraft Case Study screenshots
    await ctx.close();
    const vcCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const vcPage = await vcCtx.newPage();
    vcPage.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    vcPage.on('pageerror', (e) => pageErrors.push(e.message));

    await vcPage.goto(url, { waitUntil: 'networkidle' });
    await dismissTutorial(vcPage);

    // VCraft Current Architecture (VC-1)
    await openScenarioByTitle(vcPage, 'VCraft — Current Architecture');
    await runFastToCompletion(vcPage);
    await vcPage.screenshot({ path: path.join(assetsDir, 'vcraft-current-architecture.png') });
    await vcPage.getByRole('tab', { name: /experiments/i }).click();
    await vcPage.getByLabel(/experiment snapshot name/i).fill('VC-1 Current (60 RPS)');
    await vcPage.getByRole('button', { name: /save snapshot/i }).click();

    // VCraft Scaled Architecture (VC-3)
    await openScenarioByTitle(vcPage, 'VCraft — Scaled Architecture (Proposed)');
    await runFastToCompletion(vcPage);
    await vcPage.screenshot({ path: path.join(assetsDir, 'vcraft-scaled-architecture.png') });
    await vcPage.getByRole('tab', { name: /experiments/i }).click();
    await vcPage.getByLabel(/experiment snapshot name/i).fill('VC-3 Scaled (Proposed)');
    await vcPage.getByRole('button', { name: /save snapshot/i }).click();
    await vcPage.waitForTimeout(400);
    await vcPage.screenshot({ path: path.join(assetsDir, 'vcraft-experiment-comparison.png') });

    // Light mode & mobile responsive overflow check
    await vcPage.getByRole('button', { name: /switch to light theme/i }).click();
    await vcPage.waitForTimeout(150);
    const desktopOverflow = await vcPage
      .locator('html')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    await vcPage.setViewportSize({ width: 390, height: 844 });
    await vcPage.waitForTimeout(200);
    const mobileOverflow = await vcPage
      .locator('html')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    console.log('Responsive overflow px:', { desktopOverflow, mobileOverflow });
    await vcCtx.close();

    // 2. 1280x720 Storyboard Keyframes for animated VCraft Demo GIF
    const gifCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const gPage = await gifCtx.newPage();
    gPage.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    gPage.on('pageerror', (e) => pageErrors.push(e.message));

    await gPage.goto(url, { waitUntil: 'networkidle' });
    await gPage.waitForTimeout(250);
    // Step 1: First-time guided landing
    await gPage.screenshot({ path: path.join(framesDir, '01-open.png') });
    // Step 2: Guided Explore VCraft -> VC-1
    await gPage.getByRole('button', { name: /explore vcraft architecture/i }).click();
    await dismissTutorial(gPage);
    await gPage.waitForTimeout(350);
    await gPage.screenshot({ path: path.join(framesDir, '02-vcraft-current.png') });
    // Step 3: Run VC-1 Current -> Observe metrics & save Baseline
    await runFastToCompletion(gPage);
    await gPage.screenshot({ path: path.join(framesDir, '03-vcraft-current-run.png') });
    await gPage.getByRole('tab', { name: /experiments/i }).click();
    await gPage.getByLabel(/experiment snapshot name/i).fill('VC-1 Current');
    await gPage.getByRole('button', { name: /save snapshot/i }).click();
    // Step 4: VCraft Peak Traffic bottleneck
    await openScenarioByTitle(gPage, 'VCraft — Peak Traffic');
    await runFastToCompletion(gPage);
    await gPage.getByRole('tab', { name: /charts/i }).click();
    await gPage.waitForTimeout(300);
    await gPage.screenshot({ path: path.join(framesDir, '04-vcraft-peak-bottleneck.png') });
    // Step 5-7: Open VC-3 Scaled -> Run -> Compare in Experiment Studio
    await openScenarioByTitle(gPage, 'VCraft — Scaled Architecture (Proposed)');
    await gPage.waitForTimeout(300);
    await gPage.screenshot({ path: path.join(framesDir, '05-vcraft-scaled.png') });
    await runFastToCompletion(gPage);
    await gPage.getByRole('tab', { name: /experiments/i }).click();
    await gPage.getByLabel(/experiment snapshot name/i).fill('VC-3 Scaled');
    await gPage.getByRole('button', { name: /save snapshot/i }).click();
    await gPage.waitForTimeout(350);
    await gPage.screenshot({ path: path.join(framesDir, '06-vcraft-compare.png') });
    // Step 8-9: Failure & Recovery
    await openScenarioByTitle(gPage, 'VCraft — Failure & Recovery');
    await gPage.getByRole('tab', { name: /chaos lab/i }).click();
    await gPage.getByLabel(/playback speed/i).selectOption('100');
    await gPage.getByRole('button', { name: /run simulation/i }).click();
    await gPage.getByRole('button', { name: /run simulation/i }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await gPage.getByRole('tab', { name: /charts/i }).click();
    await gPage.waitForTimeout(350);
    await gPage.screenshot({ path: path.join(framesDir, '07-vcraft-recovery.png') });

    await gifCtx.close();

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Browser errors during capture: console=${JSON.stringify(consoleErrors)} page=${JSON.stringify(pageErrors)}`,
      );
    }
    if (desktopOverflow > 0 || mobileOverflow > 0) {
      throw new Error(
        `Unexpected horizontal overflow detected: desktop=${desktopOverflow}, mobile=${mobileOverflow}`,
      );
    }
    console.log('Captured 7 PNG assets in docs/assets/ and 7 storyboard frames cleanly.');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
