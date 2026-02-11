import { test, expect } from '@playwright/test';
import {
  goToMachine,
  getTerminalText,
  waitForTerminalText,
  typeCommand,
  typeProgram,
  typeInTerminal,
  clickReset,
  getTerminal,
} from './helpers';

test.describe('TRS-80 Emulator', () => {
  test.beforeEach(async ({ page }) => {
    await goToMachine(page, 'trs80');
  });

  test('should load and display stub ROM prompt', async ({ page }) => {
    // Stub ROM shows "READY" text
    await waitForTerminalText(page, 'READY');
  });

  test('should show TRS-80 tab as active', async ({ page }) => {
    const tab = page.locator('[role="tab"]', { hasText: 'TRS-80' });
    await expect(tab).toHaveAttribute('data-state', 'active');
  });

  test('should show CPU specs badge', async ({ page }) => {
    await expect(page.locator('text=Z80')).toBeVisible();
  });

  test('should show 64×16 display dimensions', async ({ page }) => {
    await expect(page.getByText('64×16', { exact: true }).first()).toBeVisible();
  });

  test('should echo typed characters', async ({ page }) => {
    await waitForTerminalText(page, 'READY');
    await typeInTerminal(page, 'HELLO');
    await waitForTerminalText(page, 'HELLO');
  });

  test('should reset emulator on RESET click', async ({ page }) => {
    await waitForTerminalText(page, 'READY');
    await typeInTerminal(page, 'TEST');
    await page.waitForTimeout(500);

    await clickReset(page);
    await page.waitForTimeout(2000);

    // Should see fresh prompt after reset
    await waitForTerminalText(page, 'READY');
  });
});

test.describe('TRS-80 Level I BASIC', () => {
  test.beforeEach(async ({ page }) => {
    await goToMachine(page, 'trs80');
    // Load Level I BASIC from the software library
    await page.locator('button[title="Software Library"]').click();
    await page.getByText('SOFTWARE LIBRARY', { exact: true }).waitFor({ timeout: 5000 });

    // Find and click Level I BASIC in the catalog
    await page.locator('button', { hasText: /Level I BASIC/i }).click();
    await page.waitForTimeout(500);

    // Click the action button in the modal (DOWNLOAD & LOAD or IN ROM)
    // Target the button inside the modal, not the header LOAD button
    await page.locator('button', { hasText: /DOWNLOAD & LOAD|IN ROM/ }).click();
    await page.waitForTimeout(3000);

    // Wait for BASIC to boot — should show READY
    await waitForTerminalText(page, 'READY', { timeout: 15_000 });
  });

  test('should boot to READY prompt', async ({ page }) => {
    const text = await getTerminalText(page);
    expect(text).toContain('READY');
  });

  test('should execute PRINT command', async ({ page }) => {
    await typeCommand(page, 'PRINT 42');
    await page.waitForTimeout(2000);
    await waitForTerminalText(page, '42');
  });

  test('should execute simple FOR loop (1 to 5)', async ({ page }) => {
    // Type a FOR loop program
    await typeProgram(page, [
      '10 FOR I=1 TO 5',
      '20 PRINT I',
      '30 NEXT I',
      'RUN',
    ]);

    // Wait for program to execute
    await page.waitForTimeout(5000);

    const text = await getTerminalText(page);

    // All 5 values should appear in output
    for (let n = 1; n <= 5; n++) {
      expect(text).toContain(String(n));
    }

    // Should return to READY prompt after completion
    // Find READY after RUN (not the initial READY)
    const runIndex = text.indexOf('RUN');
    const readyAfterRun = text.indexOf('READY', runIndex);
    expect(readyAfterRun).toBeGreaterThan(runIndex);
  });

  test('should execute FOR loop with STEP', async ({ page }) => {
    await typeProgram(page, [
      '10 FOR I=2 TO 10 STEP 2',
      '20 PRINT I',
      '30 NEXT I',
      'RUN',
    ]);

    await page.waitForTimeout(5000);

    const text = await getTerminalText(page);
    // Should print even numbers: 2, 4, 6, 8, 10
    expect(text).toContain('2');
    expect(text).toContain('4');
    expect(text).toContain('6');
    expect(text).toContain('8');
    expect(text).toContain('10');
  });

  test('should execute arithmetic expressions', async ({ page }) => {
    await typeCommand(page, 'PRINT 7*8');
    await page.waitForTimeout(2000);
    await waitForTerminalText(page, '56');
  });

  test('should handle variables', async ({ page }) => {
    await typeProgram(page, [
      '10 A=10',
      '20 B=20',
      '30 PRINT A+B',
      'RUN',
    ]);

    await page.waitForTimeout(3000);
    await waitForTerminalText(page, '30');
  });
});
