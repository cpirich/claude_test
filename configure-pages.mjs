#!/usr/bin/env node
/**
 * Automate GitHub Pages configuration in browser
 */

import { chromium } from '@playwright/test';

const REPO_URL = 'https://github.com/cpirich/claude_test';
const SETTINGS_URL = `${REPO_URL}/settings/pages`;

async function configureGitHubPages() {
  console.log('🚀 Launching browser to configure GitHub Pages...\n');

  // Launch browser in headed mode so you can see what's happening
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Slow down actions so you can see them
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`📂 Navigating to: ${SETTINGS_URL}`);
    await page.goto(SETTINGS_URL);

    // Wait a moment for the page to load
    await page.waitForTimeout(2000);

    // Check if we need to log in
    const loginForm = page.locator('input[name="login"]');
    if (await loginForm.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('\n⚠️  You need to log in to GitHub.');
      console.log('Please log in manually in the browser window.\n');
      console.log('Once logged in, the script will continue...\n');

      // Wait for login to complete (URL will change to settings)
      await page.waitForURL(/\/settings\/pages/, { timeout: 120000 });
      console.log('✅ Login successful!\n');
    }

    console.log('🔍 Looking for GitHub Pages configuration...\n');

    // Look for the Source dropdown/section
    const sourceSection = page.locator('text=Source').first();
    if (await sourceSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Found Pages configuration section\n');

      // Click the source dropdown
      const dropdown = page.locator('select[name="source"], summary:has-text("Deploy from a branch"), button:has-text("Deploy from a branch"), summary:has-text("GitHub Actions")').first();

      if (await dropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(500);

        // Look for "GitHub Actions" option
        const actionsOption = page.locator('text=GitHub Actions').first();
        if (await actionsOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('📝 Selecting "GitHub Actions" as source...\n');
          await actionsOption.click();
          await page.waitForTimeout(2000);
          console.log('✅ GitHub Pages configured to use GitHub Actions!\n');
        } else {
          console.log('⚠️  Could not find "GitHub Actions" option');
          console.log('You may need to manually select it from the dropdown.\n');
        }
      }
    } else {
      console.log('ℹ️  GitHub Pages may not be enabled yet, or the page structure is different.');
      console.log('The browser is open at the Pages settings - please configure manually:\n');
      console.log('1. Under "Source", select "GitHub Actions"\n');
      console.log('2. Save the changes\n');
    }

    console.log('🌐 Browser will stay open for 30 seconds so you can verify the settings...\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n🌐 Browser will stay open for 60 seconds so you can configure manually...\n');
    await page.waitForTimeout(60000);
  } finally {
    await browser.close();
    console.log('✅ Done!');
  }
}

configureGitHubPages();
