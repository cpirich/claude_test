import { type Page, expect } from '@playwright/test';

/**
 * Get the terminal <pre> element containing all display lines.
 */
export function getTerminal(page: Page) {
  return page.locator('pre').first();
}

/**
 * Get all visible text from the terminal display.
 * Returns array of trimmed row strings.
 */
export async function getTerminalLines(page: Page): Promise<string[]> {
  const terminal = getTerminal(page);
  const rows = terminal.locator('div');
  const count = await rows.count();
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).textContent();
    lines.push(text ?? '');
  }
  return lines;
}

/**
 * Get all terminal text joined with newlines.
 */
export async function getTerminalText(page: Page): Promise<string> {
  const lines = await getTerminalLines(page);
  return lines.join('\n');
}

/**
 * Wait until the terminal contains a specific string.
 * Polls the terminal text until the string appears or timeout.
 */
export async function waitForTerminalText(
  page: Page,
  text: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10_000;
  await expect(async () => {
    const content = await getTerminalText(page);
    expect(content).toContain(text);
  }).toPass({ timeout });
}

/**
 * Type a string into the terminal one character at a time.
 * The emulator's SYNTHETIC_SHIFT map handles TRS-80 shifted characters
 * (=, *, +, etc.) internally, so we just send the character directly
 * via Playwright's keyboard API.
 */
export async function typeInTerminal(page: Page, text: string, delayMs = process.env.CI ? 50 : 25): Promise<void> {
  // Ensure terminal is focused
  await getTerminal(page).click();
  await page.waitForTimeout(100);

  for (const char of text) {
    if (char === ' ') {
      await page.keyboard.press('Space');
    } else {
      await page.keyboard.press(char);
    }
    await page.waitForTimeout(delayMs);
  }
}

/**
 * Type a string and press Enter.
 */
export async function typeCommand(page: Page, command: string, delayMs = process.env.CI ? 50 : 25): Promise<void> {
  await typeInTerminal(page, command, delayMs);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
}

/**
 * Type a multi-line BASIC program (each line gets Enter).
 */
export async function typeProgram(
  page: Page,
  lines: string[],
  delayMs = process.env.CI ? 50 : 25
): Promise<void> {
  for (const line of lines) {
    await typeCommand(page, line, delayMs);
    // Extra wait between lines for BASIC to process
    await page.waitForTimeout(100);
  }
}

/**
 * Click the RESET button in the terminal header.
 */
export async function clickReset(page: Page): Promise<void> {
  await page.locator('button', { hasText: 'RESET' }).click();
}

/**
 * Click the LOAD button to open the software library modal.
 */
export async function openSoftwareLibrary(page: Page): Promise<void> {
  await page.locator('button[title="Software Library"]').click();
  // Wait for modal title to appear (exact match to avoid hint text)
  await page.getByText('SOFTWARE LIBRARY', { exact: true }).waitFor({ timeout: 5000 });
}

/**
 * Close the software library modal.
 */
export async function closeSoftwareLibrary(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByText('SOFTWARE LIBRARY', { exact: true }).waitFor({ state: 'hidden', timeout: 5000 });
}

/**
 * Navigate to a machine page and wait for the terminal to be ready.
 *
 * Handles two CI-specific issues:
 *
 * 1. **Dev server startup race**: Playwright detects the dev server is running
 *    (it responds to a health check), but Next.js hasn't finished compiling
 *    all pages. The first page.goto() may fail or render an error. We retry
 *    the navigation if the terminal doesn't appear within 10s.
 *
 * 2. **Fast Refresh resets emulator**: After the page loads, late compilation
 *    can trigger Fast Refresh, which rebuilds the React tree and recreates
 *    the emulator with the stub ROM — destroying any previously loaded ROM.
 *    We wait for Fast Refresh to settle before returning.
 */
export async function goToMachine(
  page: Page,
  machine: 'apple1' | 'trs80' | 'altair8800'
): Promise<void> {
  // Track Fast Refresh activity so we can wait for it to settle
  let lastRefreshAt = 0;
  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.text().includes('Fast Refresh')) {
      lastRefreshAt = Date.now();
    }
  };
  page.on('console', onConsole);

  // Navigate with retries — the dev server may still be compiling on first attempt
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto(`/${machine}`);
    try {
      await getTerminal(page).waitFor({ timeout: 10_000 });
      break; // Terminal appeared — page is ready
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Terminal did not appear after ${maxAttempts} navigation attempts ` +
          `(dev server may not be ready)`
        );
      }
      // Wait before retrying to give the dev server more time to compile
      await page.waitForTimeout(2000);
    }
  }

  // Wait for dev server compilation to settle.
  // On CI the first Fast Refresh typically fires 3-6s after page load.
  // We wait for either:
  //   a) A Fast Refresh event followed by 2s of quiet, or
  //   b) A maximum of 8s total if no Fast Refresh is seen
  const stabilityMs = 2000;
  const maxWaitMs = process.env.CI ? 8000 : 500;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(500);
    // If Fast Refresh fired and has been quiet for stabilityMs, we're done
    if (lastRefreshAt > 0 && Date.now() - lastRefreshAt >= stabilityMs) {
      break;
    }
  }

  page.off('console', onConsole);
}
