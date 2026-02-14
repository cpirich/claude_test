import { test, expect } from '@playwright/test';
import {
  goToMachine,
  waitForTerminalText,
  typeInTerminal,
  clickReset,
  getTerminal,
} from './helpers';

test.describe('Altair 8800 Emulator', () => {
  test.beforeEach(async ({ page }) => {
    await goToMachine(page, 'altair8800');
  });

  test('should load and display front panel', async ({ page }) => {
    await expect(page.getByTestId('altair-panel')).toBeVisible();
  });

  test('should load and display serial terminal', async ({ page }) => {
    await getTerminal(page).waitFor({ timeout: 10_000 });
    await expect(getTerminal(page)).toBeVisible();
  });

  test('should show Altair 8800 tab as active', async ({ page }) => {
    const tab = page.locator('[role="tab"]', { hasText: 'Altair 8800' });
    await expect(tab).toHaveAttribute('data-state', 'active');
  });

  test('should show CPU specs badge', async ({ page }) => {
    await expect(page.locator('[data-slot="badge"]', { hasText: '8080' })).toBeVisible();
  });

  test('should show 80×24 display dimensions', async ({ page }) => {
    await expect(page.getByText('80×24', { exact: true }).first()).toBeVisible();
  });

  test('should show turnkey boot greeting', async ({ page }) => {
    // The turnkey boot ROM prints "ALTAIR 8800" and "READY"
    await waitForTerminalText(page, 'ALTAIR 8800', { timeout: 10_000 });
    await waitForTerminalText(page, 'READY');
  });

  test('should echo typed characters via serial terminal', async ({ page }) => {
    await waitForTerminalText(page, 'READY', { timeout: 10_000 });
    await typeInTerminal(page, 'HELLO');
    await waitForTerminalText(page, 'HELLO');
  });

  test('should reset emulator on RESET button click', async ({ page }) => {
    await waitForTerminalText(page, 'READY', { timeout: 10_000 });
    await typeInTerminal(page, 'TEST');
    await waitForTerminalText(page, 'TEST');

    await clickReset(page);

    // Should see fresh turnkey boot greeting after reset
    await waitForTerminalText(page, 'ALTAIR 8800', { timeout: 10_000 });
  });

  test('should have front panel control buttons', async ({ page }) => {
    await expect(page.getByTestId('action-run')).toBeVisible();
    await expect(page.getByTestId('action-stop')).toBeVisible();
    await expect(page.getByTestId('action-examine')).toBeVisible();
    await expect(page.getByTestId('action-deposit')).toBeVisible();
    await expect(page.getByTestId('action-reset')).toBeVisible();
  });

  test('should toggle address switches', async ({ page }) => {
    const switch0 = page.getByTestId('switch-S0');
    await expect(switch0).toBeVisible();
    await switch0.click();
    // Switch should now be pressed
    await expect(switch0).toHaveAttribute('aria-pressed', 'true');
  });
});
