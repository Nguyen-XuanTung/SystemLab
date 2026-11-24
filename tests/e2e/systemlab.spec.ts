import { expect, test, type Page } from '@playwright/test';

function attachErrorTrackers(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  return { consoleErrors, pageErrors };
}

async function dismissTutorialIfVisible(page: Page): Promise<void> {
  const dismissBtn = page.getByRole('button', { name: /dismiss tutorial/i });
  if (await dismissBtn.isVisible().catch(() => false)) {
    await dismissBtn.click();
  }
}

test.describe('SystemLab End-to-End Critical Flows', () => {
  test('1. Architecture authoring: add/connect/edit nodes, validation, run, delete, and undo/redo', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorTrackers(page);
    await page.goto('/');
    await dismissTutorialIfVisible(page);

    // Create blank architecture -> Run disabled
    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByRole('button', { name: /new blank/i }).click();
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeDisabled();

    // Add Client and App Server via palette
    await page.getByRole('button', { name: /add client \/ traffic generator/i }).click();
    await page.getByRole('button', { name: /add application server/i }).click();
    await expect(page.getByTestId('canvas-node-client-1')).toBeVisible();
    await expect(page.getByTestId('canvas-node-app_server-1')).toBeVisible();

    // Unconnected client causes validation error
    await page.getByRole('button', { name: /graph validation status/i }).click();
    await expect(
      page.getByText(/requires at least one outgoing connection/i).first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Connect Client outgoing handle -> App Server incoming handle via pointer drag
    const sourceHandle = page
      .getByTestId('canvas-node-client-1')
      .locator('.react-flow__handle-right');
    const targetHandle = page
      .getByTestId('canvas-node-app_server-1')
      .locator('.react-flow__handle-left');
    const srcBox = await sourceHandle.boundingBox();
    const dstBox = await targetHandle.boundingBox();
    expect(srcBox).toBeTruthy();
    expect(dstBox).toBeTruthy();

    await page.mouse.move(srcBox!.x + srcBox!.width / 2, srcBox!.y + srcBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(dstBox!.x + dstBox!.width / 2, dstBox!.y + dstBox!.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    // Graph becomes Valid and Run becomes enabled
    await expect(page.getByRole('button', { name: /graph validation status/i })).toContainText(
      'Valid',
    );
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeEnabled();

    // Edit App Server properties and run simulation
    await page.getByTestId('canvas-node-app_server-1').click();
    await page.getByLabel(/mean service time/i).fill('25');
    await page.getByLabel(/playback speed/i).selectOption('100');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('canvas-node-app_server-1')).not.toContainText('In—');

    // Reset, delete node, then verify Undo / Redo
    await page.getByRole('button', { name: /reset simulation/i }).click();
    await page.getByTestId('canvas-node-app_server-1').click();
    await page.getByRole('button', { name: /delete node/i }).click();
    await expect(page.getByTestId('canvas-node-app_server-1')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeDisabled();

    await page.getByRole('button', { name: /^Undo$/i }).click();
    await expect(page.getByTestId('canvas-node-app_server-1')).toBeVisible();
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeEnabled();

    await page.getByRole('button', { name: /^Redo$/i }).click();
    await expect(page.getByTestId('canvas-node-app_server-1')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Execution lifecycle: scenarios, speed, pause/resume, live fault & recovery while paused, stop/reset, custom 18s duration', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorTrackers(page);
    await page.goto('/');
    await dismissTutorialIfVisible(page);

    // Load Scenario 03 (Caching Fundamentals)
    await page.getByRole('button', { name: /^Scenarios$/i }).click();
    await expect(page.getByText('Caching Fundamentals')).toBeVisible();
    await page
      .getByRole('button', { name: /open in workspace/i })
      .nth(2)
      .click();
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    // Run at 2x, pause, inject fault, and recover while STILL paused
    await page.getByLabel(/playback speed/i).selectOption('2');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /pause simulation/i }).click();
    await expect(page.getByRole('button', { name: /resume simulation/i })).toBeVisible();

    await page.getByRole('tab', { name: /chaos lab/i }).click();
    await page.getByLabel(/fault type/i).selectOption('node_failure');
    await page.getByLabel(/target component/i).selectOption('db-1');
    await page.getByRole('button', { name: /inject live fault/i }).click();
    await expect(page.getByText(/Active Faults \(1\)/i)).toBeVisible();
    await expect(page.getByTestId('canvas-node-db-1')).toContainText('FAILED');

    // Recover while paused must keep simulation PAUSED (Resume button remains visible)
    await page.getByRole('button', { name: /recover now/i }).click();
    await expect(page.getByText(/Active Faults/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /resume simulation/i })).toBeVisible();

    // Resume then Stop, then Reset & run Fast-Run to completion
    await page.getByRole('button', { name: /resume simulation/i }).click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: /stop simulation/i }).click();
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeVisible();

    await page.getByRole('button', { name: /reset simulation/i }).click();
    await page.getByLabel(/playback speed/i).selectOption('100');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.getByRole('tab', { name: /overview/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    // Load Scenario 09 (18s duration) and verify duration selector displays 18000 (18s) accurately
    await page.getByRole('button', { name: /^Scenarios$/i }).click();
    await page
      .getByRole('button', { name: /open in workspace/i })
      .nth(8)
      .click();
    await expect(page.getByLabel(/simulation duration/i)).toHaveValue('18000');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Experiments compare, export/import JSON, invalid JSON rejection, project rename/duplicate/delete & reload persistence', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorTrackers(page);
    await page.goto('/');
    await dismissTutorialIfVisible(page);

    // Load Scenario 03 for clean baseline vs candidate experiment test
    await page.getByRole('button', { name: /^Scenarios$/i }).click();
    await page
      .getByRole('button', { name: /open in workspace/i })
      .nth(2)
      .click();
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    await page.getByLabel(/playback speed/i).selectOption('100');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Baseline 85%');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await expect(page.getByText('Baseline 85%', { exact: true })).toBeVisible();

    // Modify cache hit ratio to 0.2 and save candidate
    await page.getByRole('button', { name: /reset simulation/i }).click();
    await page.getByTestId('canvas-node-cache-1').click();
    await page.getByLabel(/hit probability/i).fill('0.2');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.getByRole('tab', { name: /overview/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Candidate 20%');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await expect(page.getByText(/Baseline vs\. Candidate Comparison/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'P95 Latency' })).toBeVisible();

    // Export Project JSON
    await page.getByRole('button', { name: /project menu/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export json/i }).click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    expect(exportedPath).toBeTruthy();

    // Reject invalid/corrupted JSON import cleanly
    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByLabel(/import architecture json file/i).setInputFiles({
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"__proto__":{"polluted":true},"schemaVersion":1'),
    });
    await expect(page.getByRole('alert')).toContainText(/invalid json syntax/i);

    // Import valid exported JSON
    await page.getByLabel(/import architecture json file/i).setInputFiles(exportedPath!);
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    // Rename, Duplicate, Reload Persistence, and Delete
    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByRole('button', { name: /^Rename$/i }).click();
    const nameInput = page.getByLabel(/project name/i);
    await nameInput.fill('Audited Cache Lab');
    await nameInput.press('Enter');
    await expect(page.getByRole('button', { name: /project menu/i })).toContainText(
      'Audited Cache Lab',
    );

    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByRole('button', { name: /^Duplicate$/i }).click();
    await expect(page.getByRole('button', { name: /project menu/i })).toContainText(
      'Audited Cache Lab (Copy)',
    );

    await page.waitForTimeout(450); // allow debounced IndexedDB autosave
    await page.reload();
    await expect(page.getByRole('button', { name: /project menu/i })).toContainText(
      'Audited Cache Lab (Copy)',
    );

    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByRole('button', { name: /delete audited cache lab \(copy\)/i }).click();
    await page.getByRole('button', { name: /^Confirm$/i }).click();
    await expect(page.getByRole('button', { name: /project menu/i })).not.toContainText(
      'Audited Cache Lab (Copy)',
    );

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('4. Handles IndexedDB storage failures gracefully, theme toggle, and documentation views', async ({
    page,
  }) => {
    const { consoleErrors, pageErrors } = attachErrorTrackers(page);

    // Simulate browser environment where IndexedDB is blocked/restricted
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() {
          throw new Error('Storage access denied');
        },
      });
    });

    await page.goto('/');
    await dismissTutorialIfVisible(page);

    // Graceful warning banner surfaces and simulation still works via memory fallback
    await expect(page.getByRole('status')).toContainText(/IndexedDB/i);
    await page.getByLabel(/playback speed/i).selectOption('100');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    // Theme switching & secondary views
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    await page.getByRole('button', { name: /switch to dark theme/i }).click();

    await page.getByRole('button', { name: /^Glossary$/i }).click();
    await expect(page.getByText(/System Design Glossary/i)).toBeVisible();
    await page.getByRole('button', { name: /^About$/i }).click();
    await expect(page.getByText(/Explicit Model Assumptions/i)).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
