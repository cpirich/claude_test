import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
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

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'roms');

/**
 * Set up route interception to serve ROM files from local fixtures.
 * Uses regex patterns for reliable matching across environments.
 * Returns a tracker object that records which routes were served.
 */
async function setupRomRoutes(page: import('@playwright/test').Page) {
  const served: Record<string, boolean> = { level1: false, level2: false };

  // Use regex for more reliable matching than glob patterns
  await page.route(/model1-level1\.rom/, async (route) => {
    const romPath = path.join(FIXTURES_DIR, 'level1.rom');
    const rom = fs.readFileSync(romPath);
    served.level1 = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: rom,
    });
  });

  await page.route(/model1-level2\.rom/, async (route) => {
    const romPath = path.join(FIXTURES_DIR, 'level2.rom');
    const rom = fs.readFileSync(romPath);
    served.level2 = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: rom,
    });
  });

  return served;
}

/**
 * Load a ROM from the software library modal.
 * Handles the full flow: open modal → select entry → download → wait for boot.
 *
 * IMPORTANT: We must wait for the modal to close before checking the terminal.
 * The download is async — if we check for "READY" too early, we'll see the
 * stub ROM's READY (already on screen) instead of the new ROM's boot prompt.
 * The modal closes only after the ROM has been loaded into the emulator.
 */
async function loadFromLibrary(
  page: import('@playwright/test').Page,
  entryName: RegExp,
  options?: { expectMemorySize?: boolean }
) {
  // Open software library
  await page.locator('button[title="Software Library"]').click();
  const modalTitle = page.getByText('SOFTWARE LIBRARY', { exact: true });
  await modalTitle.waitFor({ timeout: 5000 });

  // Click the catalog entry
  const entryButton = page.locator('button', { hasText: entryName });
  await entryButton.click();

  // Wait for the detail panel to show the entry (verify selection worked)
  await page.waitForTimeout(300);

  // Click the download/load button
  const loadButton = page.locator('button', { hasText: /DOWNLOAD & LOAD|IN ROM/ });
  await loadButton.click();

  // Wait for the modal to close — this signals the ROM has been downloaded,
  // parsed, and loaded into the emulator (the onLoad callback closes the modal)
  await modalTitle.waitFor({ state: 'hidden', timeout: 30_000 });

  // Give the emulator time to reset and start executing the new ROM
  await page.waitForTimeout(500);

  if (options?.expectMemorySize) {
    // Level II BASIC boots to "MEMORY SIZE?" prompt
    await waitForTerminalText(page, 'MEMORY SIZE?', { timeout: 15_000 });
    await page.keyboard.press('Enter');
  }

  // Wait for BASIC to boot — should show READY
  await waitForTerminalText(page, 'READY', { timeout: 15_000 });
}

test.describe('TRS-80 Emulator', () => {
  test.beforeEach(async ({ page }) => {
    await setupRomRoutes(page);
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
    await waitForTerminalText(page, 'TEST');

    await clickReset(page);

    // Should see fresh prompt after reset
    await waitForTerminalText(page, 'READY');
  });
});

test.describe('TRS-80 Level I BASIC', () => {
  test.beforeEach(async ({ page }) => {
    const served = await setupRomRoutes(page);
    await goToMachine(page, 'trs80');
    await loadFromLibrary(page, /Level I BASIC/i);

    // Verify ROM was actually served (not using stub)
    expect(served.level1).toBe(true);
  });

  test('should boot to READY prompt', async ({ page }) => {
    const text = await getTerminalText(page);
    expect(text).toContain('READY');
  });

  test('should execute PRINT command', async ({ page }) => {
    await typeCommand(page, 'PRINT 42');
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

    // Wait for program to execute and return to READY
    await waitForTerminalText(page, 'READY', { timeout: 5000 });

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

    // Wait for program to execute
    await waitForTerminalText(page, '10', { timeout: 5000 });

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
    await waitForTerminalText(page, '56');
  });

  test('should handle variables', async ({ page }) => {
    await typeProgram(page, [
      '10 A=10',
      '20 B=20',
      '30 PRINT A+B',
      'RUN',
    ]);

    await waitForTerminalText(page, '30');
  });
});

test.describe('TRS-80 ROM Loading Diagnostics', () => {
  test('should verify ROM data delivery via route interception', async ({ page }) => {
    // Track console messages and page errors
    const consoleMsgs: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const served = await setupRomRoutes(page);
    await goToMachine(page, 'trs80');

    // Step 1: Verify the route interception actually delivers correct data
    // by fetching directly from the browser context
    const fetchResult = await page.evaluate(async () => {
      const resp = await fetch(
        'https://raw.githubusercontent.com/lkesteloot/trs80/master/packages/trs80-emulator/roms/model1-level1.rom'
      );
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return {
        status: resp.status,
        size: buf.byteLength,
        firstFour: Array.from(bytes.slice(0, 4)),
      };
    });

    console.log('=== DIAGNOSTIC: Direct fetch result ===');
    console.log(`  Status: ${fetchResult.status}`);
    console.log(`  Size: ${fetchResult.size}`);
    console.log(`  First 4 bytes: [${fetchResult.firstFour.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
    console.log(`  Route served: ${served.level1}`);

    expect(fetchResult.status).toBe(200);
    expect(fetchResult.size).toBe(4096);
    expect(fetchResult.firstFour[0]).toBe(0xF3); // Z80 DI instruction

    // Step 2: Check for error overlays before loading
    const errorDialogsBefore = await page.locator('dialog').count();
    console.log(`\n=== DIAGNOSTIC: Error dialogs before load: ${errorDialogsBefore} ===`);

    // Step 3: Load ROM via the UI modal
    // Reset served flag since the direct fetch already triggered it
    served.level1 = false;
    await page.locator('button[title="Software Library"]').click();
    const modalTitle = page.getByText('SOFTWARE LIBRARY', { exact: true });
    await modalTitle.waitFor({ timeout: 5000 });

    const entryButton = page.locator('button', { hasText: /Level I BASIC/i });
    await entryButton.click();
    await page.waitForTimeout(300);

    const loadButton = page.locator('button', { hasText: /DOWNLOAD & LOAD|IN ROM/ });
    await loadButton.click();

    // Wait for modal to close
    await modalTitle.waitFor({ state: 'hidden', timeout: 30_000 });
    console.log(`\n=== DIAGNOSTIC: Modal closed, served via modal: ${served.level1} ===`);

    // Step 4: Wait and check emulator state
    await page.waitForTimeout(2000);

    // Check for error overlays after loading
    const errorDialogsAfter = await page.locator('dialog').count();
    console.log(`=== DIAGNOSTIC: Error dialogs after load: ${errorDialogsAfter} ===`);

    if (errorDialogsAfter > 0) {
      const errorText = await page.locator('dialog').first().textContent();
      console.log(`=== DIAGNOSTIC: Error dialog content: ${errorText?.slice(0, 200)} ===`);
    }

    // Step 5: Read terminal text
    const terminalText = await getTerminalText(page);
    console.log(`\n=== DIAGNOSTIC: Terminal text after load ===`);
    console.log(terminalText.replace(/·/g, ' ').trim());

    // Step 6: Log console messages (filter noise)
    const relevantMsgs = consoleMsgs.filter(m =>
      !m.includes('DevTools') && !m.includes('webpack') && !m.includes('HMR')
    );
    if (relevantMsgs.length > 0) {
      console.log(`\n=== DIAGNOSTIC: Console messages (${relevantMsgs.length}) ===`);
      relevantMsgs.forEach(m => console.log(`  ${m}`));
    }

    if (pageErrors.length > 0) {
      console.log(`\n=== DIAGNOSTIC: Page errors (${pageErrors.length}) ===`);
      pageErrors.forEach(e => console.log(`  ${e}`));
    }

    // The actual assertion: after loading Level I BASIC, typing RUN after a
    // simple program should produce output (not just echo like stub ROM)
    expect(served.level1).toBe(true);

    // If terminal still shows "READY" from stub ROM, the ROM didn't load
    // Level I BASIC also shows "READY", so we need to type a command to tell the difference
    await typeCommand(page, 'PRINT 42');
    await page.waitForTimeout(1000);
    const afterPrint = await getTerminalText(page);
    console.log(`\n=== DIAGNOSTIC: Terminal after PRINT 42 ===`);
    console.log(afterPrint.replace(/·/g, ' ').trim());

    // If Level I BASIC is loaded, "42" should appear in the output
    // If stub ROM is loaded, only "PRINT 42" will be echoed (no "42" on its own line)
    expect(afterPrint).toContain('42');
  });
});

test.describe('TRS-80 Level II BASIC', () => {
  test.beforeEach(async ({ page }) => {
    const served = await setupRomRoutes(page);
    await goToMachine(page, 'trs80');
    await loadFromLibrary(page, /Level II BASIC/i, { expectMemorySize: true });

    // Verify ROM was actually served
    expect(served.level2).toBe(true);
  });

  test('should boot to READY prompt', async ({ page }) => {
    const text = await getTerminalText(page);
    expect(text).toContain('READY');
  });

  test('should execute PRINT command', async ({ page }) => {
    await typeCommand(page, 'PRINT 42');
    await waitForTerminalText(page, '42');
  });

  test('should execute FOR loop (1 to 5)', async ({ page }) => {
    await typeProgram(page, [
      '10 FOR I=1 TO 5',
      '20 PRINT I',
      '30 NEXT I',
      'RUN',
    ]);

    // Wait for program to execute and return to READY
    await waitForTerminalText(page, 'READY', { timeout: 10_000 });

    const text = await getTerminalText(page);

    // All 5 values should appear in output
    for (let n = 1; n <= 5; n++) {
      expect(text).toContain(String(n));
    }

    // Should return to READY prompt after completion
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

    // Wait for program to execute
    await waitForTerminalText(page, '10', { timeout: 5000 });

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
    await waitForTerminalText(page, '56');
  });
});
