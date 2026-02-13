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
 * On CI with `npm run dev`, the Next.js dev server may still be compiling
 * when the page first loads. We use a production build on CI (configured in
 * playwright.config.ts) to avoid Fast Refresh / HMR issues entirely.
 *
 * The navigation retry handles the rare case where the server responds to
 * the health check before the specific page route is ready.
 */
export async function goToMachine(
  page: Page,
  machine: 'apple1' | 'trs80' | 'altair8800'
): Promise<void> {
  // Navigate with retries — the server may not have the page ready yet
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto(`/${machine}`);
    try {
      await getTerminal(page).waitFor({ timeout: 15_000 });
      break; // Terminal appeared — page is ready
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Terminal did not appear after ${maxAttempts} navigation attempts ` +
          `(server may not be ready)`
        );
      }
      // Wait before retrying
      await page.waitForTimeout(2000);
    }
  }

  // Give the emulator time to boot
  await page.waitForTimeout(300);
}
