import { test, expect } from '@playwright/test';
import { goalApp } from './fixtures/goal-app';
import { goalModel } from './fixtures/goal-model';
import { mkdir } from 'node:fs/promises';
let app: Awaited<ReturnType<typeof goalApp>>, model: Awaited<ReturnType<typeof goalModel>>;
test.beforeAll(async () => { model = await goalModel(); app = await goalApp(model.endpoint.baseUrl); });
test.afterAll(async () => { await app?.close(); await model?.close(); });
test('natural-language Goal delivers readable verified work and a separately paused Goal stays paused', async ({ page }) => {
  await page.goto(app.origin + '/goals');
  await page.getByLabel('What result do you want?').fill('Write an introduction from these facts: background is a goal-driven assistant; uses are durable text work.');
  await page.getByLabel('Allow ongoing supplied-text analysis and Markdown work').check();
  await page.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(page.getByTestId('goal-lifecycle')).toHaveText('completed');
  await expect(page.getByRole('heading', { name: 'Introduction', exact: true })).toBeVisible();
  await expect(page.getByText('Verified result is ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Markdown' })).toBeVisible();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/goals-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/goals-mobile.png', fullPage: true });
  await page.getByLabel('What result do you want?').fill('Prepare another introduction later');
  await page.getByLabel('Allow ongoing supplied-text analysis and Markdown work').uncheck();
  await page.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(page.getByTestId('goal-lifecycle')).toHaveText('draft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByTestId('goal-lifecycle')).toHaveText('paused');
  await page.reload(); await expect(page.getByTestId('goal-lifecycle')).toHaveText('paused');
});

async function draft(text: string) {
  const res = await app.request('/api/goals', { text, providerId: 'legacy', modelId: 'fixture', requestId: crypto.randomUUID(), authorizeTextWork: false });
  return (await res.json()).id as string;
}
test('lost command response retries the same receipt and applies an edit once', async ({ page }) => {
  const id = await draft('Original request for receipt recovery');
  await page.goto(`${app.origin}/goals?goal=${id}`);
  await page.getByRole('button', { name: 'Edit agreement', exact: true }).click();
  await page.getByLabel('Revised request').fill('Revised request applied once');
  const requests: any[] = []; let drop = true;
  await page.route(`**/api/goals/${id}/commands`, async route => {
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (drop) { drop = false; await route.abort('failed'); } else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save revised request', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Save revised request', exact: true }).click();
  await expect(page.getByLabel('Revised request')).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).toBe(requests[0].requestId);
  expect(requests[1].expectedRevision).toBe(requests[0].expectedRevision);
  expect((await (await app.request(`/api/goals/${id}`)).json()).goal.revision).toBe(2);
});
test('delayed command on one Goal cannot erase an edit on another Goal', async ({ page }) => {
  const a = await draft('Goal A with a delayed command');
  const b = await draft('Goal B with an independent edit');
  await page.goto(`${app.origin}/goals?goal=${a}`);
  let release: (() => void) | undefined;
  await page.route(`**/api/goals/${a}/commands`, async route => {
    const response = await route.fetch();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('button', { name: /Goal B with an independent edit/ }).click();
  await page.getByRole('button', { name: 'Edit agreement', exact: true }).click();
  await page.getByLabel('Revised request').fill('Unsaved independent edit on B');
  release!();
  await expect(page.getByRole('button', { name: 'Save revised request', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Revised request')).toHaveValue('Unsaved independent edit on B');
  expect((await (await app.request(`/api/goals/${b}`)).json()).goal.revision).toBe(1);
});
