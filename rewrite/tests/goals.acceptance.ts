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

test('multi-deliverable Goal accepts ready items first, asks only for blocked item, and preserves prior results', async ({ page }) => {
  const deliverableModel = await goalModel({ deliverables: true });
  const deliverableApp = await goalApp(deliverableModel.endpoint.baseUrl);
  const screenshotDir = process.env.GOAL_ACCEPTANCE_SCREENSHOT_DIR || 'test-results';
  try {
    await mkdir(screenshotDir, { recursive: true });
    const commandPayloads: any[] = [];
    await page.route('**/api/goals/*/commands', async route => {
      commandPayloads.push(route.request().postDataJSON());
      await route.continue();
    });

    await page.goto(deliverableApp.origin + '/goals');
    await page.getByLabel('What result do you want?').fill('为本次版本发布准备三项独立文本交付：发布说明、150字以内更新介绍、基于实测记录的兼容性说明。');
    await page.getByLabel('Allow ongoing supplied-text analysis and Markdown work').check();
    await page.getByRole('button', { name: 'Create Goal', exact: true }).click();

    await expect(page.getByTestId('deliverables-panel')).toBeVisible();
    await expect(page.getByTestId('deliverables-progress')).toHaveText('2 / 3 accepted');
    await expect(page.getByTestId('goal-lifecycle')).toHaveText('active');

    await expect(page.getByTestId('deliverable-state-release-notes')).toHaveText('succeeded');
    await expect(page.getByTestId('deliverable-state-short-summary')).toHaveText('succeeded');
    await expect(page.getByTestId('deliverable-state-compat-notes')).toHaveText('waiting');
    await expect(page.getByTestId('deliverable-question-compat-notes')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toHaveCount(0);

    const releaseArtifactEl = page.getByTestId('deliverable-artifact-release-notes');
    const summaryArtifactEl = page.getByTestId('deliverable-artifact-short-summary');
    await expect(releaseArtifactEl).toContainText('支持分项交付与独立验收');
    await expect(summaryArtifactEl).toContainText('本次更新上线分项交付能力');

    const releaseArtifactIdBefore = await releaseArtifactEl.getAttribute('data-artifact-id');
    const summaryArtifactIdBefore = await summaryArtifactEl.getAttribute('data-artifact-id');
    const releaseHrefBefore = await releaseArtifactEl.getByRole('link', { name: 'Download Markdown' }).getAttribute('href');
    const summaryHrefBefore = await summaryArtifactEl.getByRole('link', { name: 'Download Markdown' }).getAttribute('href');
    const releaseTextBefore = await releaseArtifactEl.locator('.markdown').innerText();
    const summaryTextBefore = await summaryArtifactEl.locator('.markdown').innerText();

    const goalId = new URL(page.url()).searchParams.get('goal')!;
    const beforeSnapshot = await (await deliverableApp.request(`/api/goals/${goalId}`)).json();
    const beforeResults = beforeSnapshot.activity.filter((a: any) => a.kind === 'result');
    expect(beforeResults).toHaveLength(2);

    await page.screenshot({ path: `${screenshotDir}/goals-deliverables-waiting.png`, fullPage: true });

    const testNotes = 'macOS 15 + Node 24 实测通过，旧一次性与周期 Goal 无破坏性变更。';
    await page.getByLabel('Reply for 基于实测记录的兼容性说明').fill(testNotes);
    await page.getByRole('button', { name: 'Send answer for 基于实测记录的兼容性说明', exact: true }).click();

    await expect(page.getByTestId('deliverables-progress')).toHaveText('3 / 3 accepted');
    await expect(page.getByTestId('deliverable-state-compat-notes')).toHaveText('succeeded');
    await expect(page.getByTestId('goal-lifecycle')).toHaveText('completed');
    await expect(page.getByTestId('deliverable-question-compat-notes')).toHaveCount(0);

    const compatArtifactEl = page.getByTestId('deliverable-artifact-compat-notes');
    await expect(compatArtifactEl).toContainText(testNotes);
    await expect(compatArtifactEl.getByRole('link', { name: 'Download Markdown' })).toBeVisible();

    const answerCall = commandPayloads.find(p => p.action === 'answer');
    expect(answerCall?.deliverableId).toBe('compat-notes');

    // Verify first two deliverables kept their exact artifacts, download links, and rendered content
    expect(await releaseArtifactEl.getAttribute('data-artifact-id')).toBe(releaseArtifactIdBefore);
    expect(await summaryArtifactEl.getAttribute('data-artifact-id')).toBe(summaryArtifactIdBefore);
    expect(await releaseArtifactEl.getByRole('link', { name: 'Download Markdown' }).getAttribute('href')).toBe(releaseHrefBefore);
    expect(await summaryArtifactEl.getByRole('link', { name: 'Download Markdown' }).getAttribute('href')).toBe(summaryHrefBefore);
    expect(await releaseArtifactEl.locator('.markdown').innerText()).toBe(releaseTextBefore);
    expect(await summaryArtifactEl.locator('.markdown').innerText()).toBe(summaryTextBefore);

    const afterSnapshot = await (await deliverableApp.request(`/api/goals/${goalId}`)).json();
    const afterResults = afterSnapshot.activity.filter((a: any) => a.kind === 'result');
    expect(afterResults).toHaveLength(3);
    expect(afterResults.slice(0, 2).map((a: any) => a.id)).toEqual(beforeResults.map((a: any) => a.id));
    for (const id of ['release-notes', 'short-summary']) {
      const prev = beforeSnapshot.deliverables.find((d: any) => d.id === id);
      const next = afterSnapshot.deliverables.find((d: any) => d.id === id);
      expect(next.artifactId).toBe(prev.artifactId);
      expect(next.evidence).toEqual(prev.evidence);
    }

    await page.screenshot({ path: `${screenshotDir}/goals-deliverables-completed.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${screenshotDir}/goals-deliverables-mobile.png`, fullPage: true });
  } finally {
    await deliverableApp.close();
    await deliverableModel.close();
  }
});

test('deliverable card updates artifact link and content live after verification rejection and revision without reload', async ({ page }) => {
  const revisedModel = await goalModel({ deliverables: true, deliverableRejectOnceId: 'release-notes' });
  const revisedApp = await goalApp(revisedModel.endpoint.baseUrl);
  try {
    revisedModel.hold('verify:release-notes');

    await page.goto(revisedApp.origin + '/goals');
    await page.getByLabel('What result do you want?').fill('为本次版本发布准备三项独立文本交付，并在发布说明初稿被拒后完成修订验收。');
    await page.getByLabel('Allow ongoing supplied-text analysis and Markdown work').check();
    await page.getByRole('button', { name: 'Create Goal', exact: true }).click();

    const releaseArtifactEl = page.getByTestId('deliverable-artifact-release-notes');
    await expect(page.getByTestId('deliverable-state-release-notes')).toHaveText('verifying');
    await expect(releaseArtifactEl).toBeVisible();

    const firstArtifactId = await releaseArtifactEl.getAttribute('data-artifact-id');
    expect(firstArtifactId).toBeTruthy();
    expect(firstArtifactId!).toMatch(/:artifact:1$/);
    await expect(releaseArtifactEl.getByRole('link', { name: 'Download Markdown' }))
      .toHaveAttribute('href', new RegExp(`${encodeURIComponent(firstArtifactId!)}\\?download=1$`));
    await expect(releaseArtifactEl.locator('.markdown')).toContainText('支持分项交付与独立验收');
    await expect(releaseArtifactEl.locator('.markdown')).not.toContainText('修订版正文');

    // Release verification: 1st verify rejects -> 2nd work produces artifact:2 -> 2nd verify accepts.
    revisedModel.release('verify:release-notes');

    // Without reloading the page, the deliverable card must update live to artifact:2.
    await expect(page.getByTestId('deliverable-state-release-notes')).toHaveText('succeeded');
    await expect(page.getByTestId('deliverables-progress')).toHaveText('2 / 3 accepted');
    await expect(releaseArtifactEl).toHaveAttribute('data-artifact-id', /:artifact:2$/);

    const secondArtifactId = await releaseArtifactEl.getAttribute('data-artifact-id');
    expect(secondArtifactId).toBeTruthy();
    expect(secondArtifactId).not.toBe(firstArtifactId);
    await expect(releaseArtifactEl.getByRole('link', { name: 'Download Markdown' }))
      .toHaveAttribute('href', new RegExp(`${encodeURIComponent(secondArtifactId!)}\\?download=1$`));
    await expect(releaseArtifactEl.locator('.markdown')).toContainText('修订版正文：已按验收意见补充完善。');

    const goalId = new URL(page.url()).searchParams.get('goal')!;
    const snapshot = await (await revisedApp.request(`/api/goals/${goalId}`)).json();
    const releaseDeliverable = snapshot.deliverables.find((d: any) => d.id === 'release-notes');
    expect(releaseDeliverable.state).toBe('succeeded');
    expect(releaseDeliverable.artifactId).toBe(secondArtifactId);
  } finally {
    await revisedApp.close();
    await revisedModel.close();
  }
});


test('editing an agreement cannot show a historical same-slug artifact as the current deliverable', async ({ page }) => {
  const model = await goalModel({ deliverables: true });
  const app = await goalApp(model.endpoint.baseUrl);
  try {
    const created = await app.request('/api/goals', { text: 'Prepare three text deliveries', providerId: 'legacy', modelId: 'fixture', requestId: 'same-slug', authorizeTextWork: true });
    const { id } = await created.json();
    await page.goto(`${app.origin}/goals?goal=${id}`);
    await expect(page.getByTestId('deliverable-state-release-notes')).toHaveText('succeeded');
    await expect(page.getByTestId('deliverable-artifact-release-notes')).toBeVisible();
    model.hold('review:release-notes');
    await page.getByRole('button', { name: 'Edit agreement', exact: true }).click();
    await page.getByLabel('Revised request').fill('Prepare revised text deliveries with a new agreement');
    await page.getByRole('button', { name: 'Save revised request', exact: true }).click();
    await expect(page.getByTestId('deliverable-state-release-notes')).toHaveText('ready');
    await expect(page.getByTestId('deliverable-artifact-release-notes')).toHaveCount(0);
    expect((await (await app.request(`/api/goals/${id}`)).json()).artifacts.length).toBeGreaterThan(0);
  } finally { await app.close(); await model.close(); }
});
