import { expect, test } from '../support/test.ts';
import { PRODUCT_NAME } from '../../src/config/product.ts';

test('the app opens in Chrome with the product name as the page title', async ({ page, browserName }) => {
  expect(browserName).toBe('chromium');
  await page.goto('/');
  await expect(page).toHaveTitle(PRODUCT_NAME);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PRODUCT_NAME);
});
