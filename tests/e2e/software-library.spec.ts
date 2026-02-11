import { test, expect } from '@playwright/test';
import {
  goToMachine,
  openSoftwareLibrary,
  closeSoftwareLibrary,
  getTerminal,
} from './helpers';

test.describe('Software Library Modal', () => {
  test.beforeEach(async ({ page }) => {
    await goToMachine(page, 'apple1');
  });

  test('should open and close with LOAD button', async ({ page }) => {
    await openSoftwareLibrary(page);
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).toBeVisible();

    await closeSoftwareLibrary(page);
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).not.toBeVisible();
  });

  test('should show BROWSE tab by default', async ({ page }) => {
    await openSoftwareLibrary(page);
    // Category filter buttons should be visible
    await expect(page.locator('button', { hasText: 'ALL' })).toBeVisible();
  });

  test('should show software catalog entries', async ({ page }) => {
    await openSoftwareLibrary(page);
    // Should have at least one software entry visible
    // Woz Monitor should always be in the catalog
    await expect(page.locator('button', { hasText: /Woz Monitor/i })).toBeVisible();
  });

  test('should filter by category', async ({ page }) => {
    await openSoftwareLibrary(page);

    // Click LANG category
    await page.locator('button', { hasText: 'LANG' }).click();
    await page.waitForTimeout(500);

    // Language entries should be visible
    const entries = page.locator('button', { hasText: /BASIC/i });
    await expect(entries.first()).toBeVisible();
  });

  test('should show details when selecting an entry', async ({ page }) => {
    await openSoftwareLibrary(page);

    // Click on Woz Monitor entry
    await page.locator('button', { hasText: /Woz Monitor/i }).click();
    await page.waitForTimeout(300);

    // Details panel should show entry info (AUTHOR, LOAD, SIZE fields)
    await expect(page.locator('text=AUTHOR:')).toBeVisible();
  });

  test('should have URL tab', async ({ page }) => {
    await openSoftwareLibrary(page);

    // Switch to URL tab
    await page.locator('button', { hasText: 'URL' }).click();
    await page.waitForTimeout(300);

    // URL input should be visible
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
  });

  test('should have FILE tab', async ({ page }) => {
    await openSoftwareLibrary(page);

    // Switch to FILE tab
    await page.locator('button', { hasText: 'FILE' }).click();
    await page.waitForTimeout(300);

    // Drop zone should be visible
    await expect(page.locator('text=DROP FILE HERE')).toBeVisible();
  });

  test('should close with Escape key', async ({ page }) => {
    await openSoftwareLibrary(page);
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).not.toBeVisible();
  });

  test('should close when clicking [X] button', async ({ page }) => {
    await openSoftwareLibrary(page);
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).toBeVisible();

    // Click the close button [X]
    await page.locator('button', { hasText: '[X]' }).click();
    await expect(page.getByText('SOFTWARE LIBRARY', { exact: true })).not.toBeVisible();
  });
});

test.describe('Machine Switching', () => {
  test('should switch from Apple I to TRS-80 via tab', async ({ page }) => {
    await goToMachine(page, 'apple1');

    // Click TRS-80 tab
    const trsTab = page.locator('[role="tab"]', { hasText: 'TRS-80' });
    await trsTab.click();
    await page.waitForTimeout(2000);

    // URL should update
    await expect(page).toHaveURL(/trs80/);

    // TRS-80 terminal should display
    await expect(page.locator('text=Z80')).toBeVisible();
  });

  test('should switch from TRS-80 to Apple I via tab', async ({ page }) => {
    await goToMachine(page, 'trs80');

    // Click Apple I tab
    const appleTab = page.locator('[role="tab"]', { hasText: 'Apple I' });
    await appleTab.click();
    await page.waitForTimeout(2000);

    // URL should update
    await expect(page).toHaveURL(/apple1/);

    // Apple I terminal should display
    await expect(page.locator('text=6502')).toBeVisible();
  });

  test('should navigate directly to /apple1', async ({ page }) => {
    await page.goto('/apple1');
    await getTerminal(page).waitFor({ timeout: 10_000 });
    await expect(page.locator('text=6502')).toBeVisible();
  });

  test('should navigate directly to /trs80', async ({ page }) => {
    await page.goto('/trs80');
    await getTerminal(page).waitFor({ timeout: 10_000 });
    await expect(page.locator('text=Z80')).toBeVisible();
  });

  test('should redirect / to /apple1', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/apple1/);
    await expect(page).toHaveURL(/apple1/);
  });
});

test.describe('Machine Guide', () => {
  test('should show machine guide expanded by default', async ({ page }) => {
    await goToMachine(page, 'apple1');
    // Guide should show history text and Hide Guide button
    await expect(page.locator('button', { hasText: 'Hide Guide' })).toBeVisible();
  });

  test('should collapse and expand guide', async ({ page }) => {
    await goToMachine(page, 'apple1');

    // Click to collapse
    await page.locator('button', { hasText: 'Hide Guide' }).click();
    await page.waitForTimeout(300);

    // Should now show "Show Guide"
    await expect(page.locator('button', { hasText: 'Show Guide' })).toBeVisible();

    // Click to expand again
    await page.locator('button', { hasText: 'Show Guide' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('button', { hasText: 'Hide Guide' })).toBeVisible();
  });

  test('should have clickable example commands', async ({ page }) => {
    await goToMachine(page, 'apple1');

    // Example commands should be clickable buttons
    // Apple I default has FF00 as a command
    const cmdButton = page.locator('button', { hasText: 'FF00' }).first();
    await expect(cmdButton).toBeVisible();
  });
});
