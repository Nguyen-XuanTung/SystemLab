import { expect, test } from '@playwright/test';

test.describe('SystemLab End-to-End Critical Flows', () => {
  test('executes full workflow: scenarios, run/pause/resume, chaos fault, experiment compare, import/export, persistence, custom edits', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Open app
    await page.goto('/');
    await expect(page.getByText('SystemLab')).toBeVisible();

    // Dismiss tutorial if visible so canvas & controls are unobstructed
    const dismissBtn = page.getByRole('button', { name: /dismiss tutorial/i });
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click();
    }

    // 2. Choose Scenario 03 (Caching Fundamentals) from Scenarios view
    await page.getByRole('button', { name: /^Scenarios$/i }).click();
    await expect(page.getByText('Caching Fundamentals')).toBeVisible();
    await page.getByRole('button', { name: /open in workspace/i }).nth(2).click();
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    // 3. Run simulation at 2x, pause, and resume, then Fast-Run to finish
    await page.getByLabel(/playback speed/i).selectOption('2');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /pause simulation/i }).click();
    await expect(page.getByRole('button', { name: /resume simulation/i })).toBeVisible();

    // 6. Inject fault live in Chaos Lab while paused & observe node status change
    await page.getByRole('tab', { name: /chaos lab/i }).click();
    await page.getByLabel(/fault type/i).selectOption('node_failure');
    await page.getByLabel(/target component/i).selectOption('db-1');
    await page.getByRole('button', { name: /inject live fault/i }).click();
    await expect(page.getByText(/Active Faults \(1\)/i)).toBeVisible();
    await expect(page.getByTestId('canvas-node-db-1')).toContainText('FAILED');

    // Resume at Fast-Run (100) to finish cleanly
    await page.getByLabel(/playback speed/i).selectOption('100');
    await page.getByRole('button', { name: /resume simulation/i }).click();
    await page.getByRole('tab', { name: /overview/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    // 8. Save Baseline Experiment in Experiment Studio
    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Cache 85% + Fault');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await expect(page.getByText('Cache 85% + Fault', { exact: true })).toBeVisible();

    // 9. Reset, modify Cache hit probability to 0.2, run Candidate & save
    await page.getByRole('button', { name: /reset simulation/i }).click();
    await page.getByTestId('canvas-node-cache-1').click();
    await page.getByLabel(/hit probability/i).fill('0.2');
    await page.getByRole('button', { name: /run simulation/i }).click();
    await page.getByRole('tab', { name: /overview/i }).click();
    await expect(page.getByText(/Conservation:/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('tab', { name: /experiments/i }).click();
    await page.getByLabel(/experiment snapshot name/i).fill('Cache 20% Candidate');
    await page.getByRole('button', { name: /save snapshot/i }).click();
    await expect(page.getByText('Cache 20% Candidate', { exact: true })).toBeVisible();

    // 10. Compare Baseline vs Candidate
    await expect(page.getByText(/Baseline vs\. Candidate Comparison/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'P95 Latency' })).toBeVisible();

    // Verify Charts tab renders SVGs cleanly
    await page.getByRole('tab', { name: /charts/i }).click();
    await expect(page.getByText('Throughput over Virtual Time (RPS)')).toBeVisible();

    // 11–12. Export & Import Project JSON
    await page.getByRole('button', { name: /project menu/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export json/i }).click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    expect(exportedPath).toBeTruthy();

    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByLabel(/import architecture json file/i).setInputFiles(exportedPath!);
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    // 13–14. Reload browser and verify IndexedDB persistence
    await page.reload();
    await expect(page.getByTestId('canvas-node-cache-1')).toBeVisible();

    // 15–16. Create blank architecture, add node via click, verify invalid config error blocks run
    await page.getByRole('button', { name: /project menu/i }).click();
    await page.getByRole('button', { name: /new blank/i }).click();
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeDisabled();

    await page.getByRole('button', { name: /add client \/ traffic generator/i }).click();
    // Client without downstream edge is invalid; invalid rate also blocks run
    await page.getByRole('button', { name: /graph validation status/i }).click();
    await expect(
      page.getByText(/requires at least one outgoing connection/i).first(),
    ).toBeVisible();
    await page.getByLabel(/request rate/i).fill('0');
    await expect(page.getByText(/request rate must be between/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /run simulation/i })).toBeDisabled();

    // Toggle light theme & back
    await page.getByRole('button', { name: /switch to light theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    await page.getByRole('button', { name: /switch to dark theme/i }).click();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
