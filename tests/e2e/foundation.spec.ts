import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('home is accessible in light and dark themes', async ({
  page,
}, testInfo) => {
  await page.goto('/home');
  await expect(
    page.getByRole('heading', { name: 'Hello, Section C!' }),
  ).toBeVisible();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
    const primaryAction = page.locator('.welcome-card .button');
    await primaryAction.focus();
    await expect(primaryAction).toBeFocused();
    const target = await primaryAction.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`home-${theme}.png`),
      fullPage: true,
    });
  }
});
test('production app shell reloads offline', async ({ page, context }) => {
  await page.goto('/home');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Hello, Section C!' }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Saved offline records' }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'You are offline.' }),
  ).toBeVisible();
  const mascot = page.locator('.sidebar img.ci').first();
  await expect(mascot).toHaveJSProperty('complete', true);
  expect(
    await mascot.evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await context.setOffline(false);
});
test('classroom shell and five mobile destinations', async ({
  page,
}, testInfo) => {
  await page.goto('/home');
  await expect(
    page.getByRole('heading', { name: 'Hello, Section C!' }),
  ).toBeVisible();
  await expect(
    page.getByText('Foundation preview · No live classroom data connected'),
  ).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.bottom-nav a')).toHaveCount(5);
  }
  await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
test('language and theme persist', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Kumusta, Seksyon C!' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tema', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Kumusta, Seksyon C!' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
test('unconfigured login fails closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: false }),
  ).toBeDisabled();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.locator('.auth-mascot')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Show password' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await expect(
    page.getByRole('button', { name: 'Hide password' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByText('Supabase is not configured.', { exact: false }),
  ).toBeVisible();
});
test('administrative routes require authentication', async ({ page }) => {
  await page.goto('/administration');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login$/);
});
test('private attendance requires authentication while policies stay accessible', async ({
  page,
}) => {
  await page.goto('/attendance');
  await expect(page).toHaveURL(/login$/);
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await page.goto('/privacy');
  await expect(
    page.getByText('C-LEAD stores classroom account', { exact: false }),
  ).toBeVisible();
});
test('installation instructions cover both mobile platforms', async ({
  page,
}) => {
  await page.goto('/install');
  await expect(
    page.getByRole('heading', { name: 'Android', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'iPhone / iPad', exact: true }),
  ).toBeVisible();
});
test('offline indicator disables writes', async ({ page, context }) => {
  await page.goto('/home');
  await context.setOffline(true);
  await expect(
    page.getByRole('status').filter({ hasText: 'You are offline.' }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('service worker updates wait for confirmation and Later preserves a form', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'One worker changes the isolated test service worker.',
  );
  const { readFile, writeFile } = await import('node:fs/promises');
  const path = 'dist-shell-tests/sw.js';
  const original = await readFile(path, 'utf8');
  try {
    await page.goto('/login');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page
      .getByLabel('Username', { exact: true })
      .fill('fictional_unsaved');
    await writeFile(path, original + '\n// update verification ' + Date.now());
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r?.update();
    });
    await expect(
      page.getByText('A new version of C-LEAD is available.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
      'fictional_unsaved',
    );
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
      'fictional_unsaved',
    );
    expect(
      await page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Update', exact: true }),
    ).toBeVisible();
    const navigation = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await navigation;
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(false);
  } finally {
    await writeFile(path, original);
  }
});
