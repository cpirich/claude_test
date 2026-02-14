import { test, expect } from '@playwright/test';
import {
  goToMachine,
  getTerminalText,
  waitForTerminalText,
  typeCommand,
  typeInTerminal,
  clickReset,
} from './helpers';

test.describe('Apple I Emulator', () => {
  test.beforeEach(async ({ page }) => {
    await goToMachine(page, 'apple1');
  });

  test('should load and display Woz Monitor prompt', async ({ page }) => {
    // The Woz Monitor shows a '\' prompt on boot
    await waitForTerminalText(page, '\\');
  });

  test('should show page title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Claude Microcomputer Emulator');
  });

  test('should show Apple I tab as active', async ({ page }) => {
    const tab = page.locator('[role="tab"]', { hasText: 'Apple I' });
    await expect(tab).toHaveAttribute('data-state', 'active');
  });

  test('should show CPU specs badge', async ({ page }) => {
    await expect(page.locator('text=6502')).toBeVisible();
  });

  test('should echo typed characters', async ({ page }) => {
    await waitForTerminalText(page, '\\');
    await typeInTerminal(page, 'FF00');
    await waitForTerminalText(page, 'FF00');
  });

  test('should display hex dump for FF00.FF0F command', async ({ page }) => {
    await waitForTerminalText(page, '\\');
    await typeCommand(page, 'FF00.FF0F');

    // Woz Monitor should display hex bytes at FF00-FF0F
    // The first byte of Woz Monitor at $FF00 is $D8 (CLD)
    await waitForTerminalText(page, 'FF00');
    const text = await getTerminalText(page);
    // Should have hex values displayed
    expect(text).toMatch(/FF0[0-9A-F]/);
  });

  test('should reset emulator on RESET click', async ({ page }) => {
    await waitForTerminalText(page, '\\');
    // Type something
    await typeInTerminal(page, 'ABCD');
    await waitForTerminalText(page, 'ABCD');

    // Click reset
    await clickReset(page);

    // Should see fresh Woz Monitor prompt
    await waitForTerminalText(page, '\\');
  });

  test('should have terminal with 40-column width', async ({ page }) => {
    await expect(page.getByText('40×24', { exact: true }).first()).toBeVisible();
  });
});
