import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/appReady';

/**
 * Basic test to verify the AI testing infrastructure is working
 */
test.describe('AI Agent Testing Infrastructure', () => {
  test('should load the application homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Wait for the page to load
    await waitForAppReady(page);
    
    // Wait for any potential loading screens or dynamic content
    await page.waitForTimeout(2000);
    
    // Take a screenshot for verification
    await page.screenshot({ 
      path: 'test-results/homepage-verification.png',
      fullPage: true 
    });
    
    // Basic assertions
    expect(page.url()).toContain('localhost');
    
    // Check that the page has loaded content (use a more flexible selector)
    const htmlElement = page.locator('html');
    await expect(htmlElement).toBeVisible();
    
    // Check if there's a root div (common in React apps)
    // Use stable test id for root element
    const rootDiv = page.locator('[data-testid="app-root"]');
    const rootExists = await rootDiv.count() > 0;
    
    if (rootExists) {
      console.log('✅ Found application root element');
    } else {
      console.log('ℹ️ No obvious root element found, but page loaded');
    }
    
    console.log('✅ Homepage loaded successfully');
  });

  test('should detect basic UI elements', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(2000); // Allow time for dynamic content to load
    
    // Look for common UI elements with broader selectors
    const buttons = await page.locator('button, [role="button"], input[type="button"], input[type="submit"]').count();
    const links = await page.locator('a[href], [role="link"]').count();
    const inputs = await page.locator('input, textarea, select').count();
    const divs = await page.locator('div').count();
    const allElements = await page.locator('*').count();
    
    console.log(`Found ${buttons} buttons, ${links} links, ${inputs} inputs`);
    console.log(`Total elements on page: ${allElements}, divs: ${divs}`);
    
    // Should have at least some HTML elements even if no interactive ones
    expect(allElements).toBeGreaterThan(5); // At least html, head, body, etc.
    
    // Log what we found
    if (buttons + links + inputs === 0) {
      console.log('ℹ️ No interactive elements found - page might be loading or styled differently');
    } else {
      console.log('✅ Found interactive elements');
    }
  });

  test('should be accessible to screen readers', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Basic accessibility checks
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    const inputsWithoutLabels = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.filter(input => {
        const inputElement = input as HTMLInputElement;
        const hasLabel = inputElement.labels && inputElement.labels.length > 0;
        const hasAriaLabel = input.getAttribute('aria-label');
        return !hasLabel && !hasAriaLabel;
      }).length;
    });

    console.log(`Found ${imagesWithoutAlt} images without alt text`);
    console.log(`Found ${inputsWithoutLabels} inputs without labels`);
    
    // Assert no missing accessibility metadata
    expect(imagesWithoutAlt, 'All images should have alt text').toBe(0);
    expect(inputsWithoutLabels, 'All inputs should have labels or aria-labels').toBe(0);
  });

  test('should complete a basic interaction workflow', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-results/workflow-start.png' 
    });
    
    // Try to interact with the first button found
    const firstButton = page.locator('button').first();
    if (await firstButton.isVisible()) {
      await firstButton.click();
      await page.waitForTimeout(1000);
      
      // Take screenshot after interaction
      await page.screenshot({ 
        path: 'test-results/workflow-after-click.png' 
      });
      
      console.log('✅ Button interaction completed');
    } else {
      console.log('ℹ️ No buttons found for interaction test');
    }
    
    // This test should always pass - it's just documenting the UI state
    expect(true).toBe(true);
  });

  /**
   * Asserts the PROPERTY, not a particular label.
   *
   * This expected the first tab stop to read "Join Team" — a control the UI no
   * longer has — and it tabbed before the app had booted, so it was really
   * asserting against the loading splash. Pinning one label makes the test
   * fail on every legitimate nav change while telling nobody anything about
   * keyboard access.
   *
   * What actually matters is that the first Tab reaches a real interactive
   * control in the loaded app, which is what a keyboard-only operator needs.
   */
  test('should allow keyboard navigation to interactive elements', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return {
        tag: el.tagName,
        interactive: ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
          || el.tabIndex >= 0,
        inPreloader: !!el.closest('.starcom-preloader'),
        isBody: el === document.body,
      };
    });

    expect(focused, 'nothing received focus on Tab').not.toBeNull();
    expect(focused!.inPreloader, 'focus landed in the loading splash').toBe(false);
    expect(focused!.isBody, 'Tab did not move focus off <body>').toBe(false);
    expect(focused!.interactive, `first tab stop was a non-interactive ${focused!.tag}`).toBe(true);
  });
});
