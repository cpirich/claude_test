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
 * TRS-80 shifted character map.
 * Maps characters that require SHIFT on the TRS-80 to their base key.
 * e.g. '=' requires SHIFT+'-' on TRS-80 keyboard.
 */
const TRS80_SHIFTED: Record<string, string> = {
  '=': '-', '+': ';', '*': ':', '!': '1', '"': '2', '#': '3',
  '$': '4', '%': '5', '&': '6', "'": '7', '(': '8', ')': '9',
  '<': ',', '>': '.', '?': '/',
};

/**
 * Dispatch a raw keyboard event on the focused element (terminal container).
 * Bypasses browser key remapping to send exact key values to the emulator.
 */
async function dispatchKey(page: Page, type: 'keydown' | 'keyup', key: string): Promise<void> {
  await page.evaluate(([t, k]) => {
    const target = document.activeElement || document;
    target.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true }));
  }, [type, key] as const);
}

/**
 * Type a string into the terminal one character at a time.
 * Handles TRS-80 shifted characters (=, *, +, etc.) by dispatching
 * raw keyboard events with SHIFT + base key.
 */
export async function typeInTerminal(page: Page, text: string, delayMs = 25): Promise<void> {
  // Ensure terminal is focused
  await getTerminal(page).click();
  await page.waitForTimeout(100);

  for (const char of text) {
    if (char === ' ') {
      await page.keyboard.press('Space');
    } else if (TRS80_SHIFTED[char]) {
      // TRS-80 shifted character: dispatch SHIFT + base key via raw events
      const baseKey = TRS80_SHIFTED[char];
      await dispatchKey(page, 'keydown', 'Shift');
      await page.waitForTimeout(20);
      await dispatchKey(page, 'keydown', baseKey);
      await page.waitForTimeout(30);
      await dispatchKey(page, 'keyup', baseKey);
      await dispatchKey(page, 'keyup', 'Shift');
    } else {
      await page.keyboard.press(char);
    }
    await page.waitForTimeout(delayMs);
  }
}

/**
 * Type a string and press Enter.
 */
export async function typeCommand(page: Page, command: string, delayMs = 25): Promise<void> {
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
  delayMs = 25
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
 */
export async function goToMachine(
  page: Page,
  machine: 'apple1' | 'trs80'
): Promise<void> {
  await page.goto(`/${machine}`);
  // Wait for the terminal <pre> element to appear
  await getTerminal(page).waitFor({ timeout: 30_000 });
  // Give the emulator time to boot
  await page.waitForTimeout(300);
}
