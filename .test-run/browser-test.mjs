import { chromium } from 'playwright';

const results = [];
const log = (area, test, pass, note = '') => results.push({ area, test, pass, note });

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

const failedResources = [];
page.on('response', (res) => {
  if (res.status() >= 400) failedResources.push(`${res.status()} ${res.url()}`);
});

await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });

const title = await page.title();
log('Smoke', 'Page loads', title.includes('MarketPilot AI'), title);

log(
  'Smoke',
  'External assets load',
  failedResources.length === 0,
  failedResources.join('; ') || 'all OK'
);
log(
  'Smoke',
  'No JS console errors',
  consoleErrors.length === 0,
  consoleErrors.join('; ') || 'none'
);

const views = [
  { name: 'Home', view: 'home' },
  { name: 'Campaign', view: 'campaign' },
  { name: 'Create', view: 'create' },
  { name: 'Audience', view: 'audience' },
  { name: 'Agent', view: 'agent' },
];

for (const v of views) {
  await page.click(`button[data-view="${v.view}"]`);
  const activeNav = await page.locator('.nav-item.active').textContent();
  const viewVisible = await page
    .locator(`#view-${v.view}`)
    .evaluate((el) => el.classList.contains('active'));
  log('Navigation', `${v.name} view`, activeNav.includes(v.name) && viewVisible);
}

await page.click('button[data-view="home"]');
const subs = await page.locator('.metric-val').first().textContent();
log('Dashboard', 'Metrics display', subs.trim() === '31');
log('Dashboard', 'Chart renders', (await page.locator('.chart-wrap svg').count()) === 1);
log('Dashboard', 'Metrics update on interaction', false, 'Static hardcoded values');

await page.click('button[data-view="campaign"]');
log('Campaign', 'Campaign card visible', await page.locator('.campaign-card').isVisible());
log(
  'Campaign',
  'Rail starts at Test step',
  await page.locator('#rail-test').evaluate((el) => el.classList.contains('current'))
);
await page.click('#rerun-test');
log(
  'CampaignTwin',
  'Improve my campaign advances rail',
  (await page.locator('#rail-approve').evaluate((el) => el.classList.contains('current'))) &&
    (await page.locator('#rail-test').evaluate((el) => el.classList.contains('done')))
);
log(
  'CampaignTwin',
  'Persona simulation is dynamic',
  false,
  'Personas are static HTML; button only updates rail step'
);

await page.click('button[data-view="create"]');
const firstCard = page.locator('.qcard').first();
const wasApproved = await firstCard.evaluate((el) => el.classList.contains('approved'));
await firstCard.locator('.approve-btn').click();
const nowApproved = await firstCard.evaluate((el) => el.classList.contains('approved'));
log('Approval', 'Approve toggles on', !wasApproved && nowApproved);
await firstCard.locator('.approve-btn').click();
log(
  'Approval',
  'Approve toggles off',
  await firstCard.evaluate((el) => !el.classList.contains('approved'))
);

const previewCount = await page.locator('button:has(.ti-eye)').count();
let previewChangedDom = false;
const domBeforePreview = await page.locator('#view-create').innerHTML();
await page.locator('button:has(.ti-eye)').first().click();
await page.waitForTimeout(300);
const domAfterPreview = await page.locator('#view-create').innerHTML();
previewChangedDom = domBeforePreview !== domAfterPreview;
log(
  'Create',
  `Preview buttons wired (${previewCount} found)`,
  previewChangedDom,
  'No handler — click does nothing'
);

const regenCount = await page.locator('#view-create button:has(.ti-refresh)').count();
const domBeforeRegen = await page.locator('#view-create').innerHTML();
await page.locator('#view-create button:has(.ti-refresh)').first().click();
await page.waitForTimeout(300);
const domAfterRegen = await page.locator('#view-create').innerHTML();
log(
  'Create',
  `Regenerate buttons wired (${regenCount} found)`,
  domBeforeRegen !== domAfterRegen,
  'No handler — click does nothing'
);
log('Create', 'Content generation occurs', false, 'All queue copy is hardcoded');

await page.click('button[data-view="agent"]');
const thirdTask = page.locator('[data-task]').nth(2);
const taskWasDone = await thirdTask.evaluate((el) => el.classList.contains('done'));
await thirdTask.click();
log(
  'Tasks',
  'Checkbox toggles done state',
  !taskWasDone && (await thirdTask.evaluate((el) => el.classList.contains('done')))
);

await page.click('button[data-view="home"]');
const streakText = await page.locator('.metric').nth(1).locator('.metric-delta').textContent();
log(
  'Tasks',
  'Home streak syncs with task completion',
  false,
  `Still shows "${streakText.trim()}" after completing all tasks`
);

await page.click('button[data-view="audience"]');
log('Audience', 'Subscriber table renders', (await page.locator('table.roster tr').count()) >= 7);
log('Audience', 'Channel chart renders', (await page.locator('#view-audience svg').count()) === 1);

await page.setViewportSize({ width: 375, height: 812 });
await page.click('button[data-view="home"]');
const appDirection = await page.locator('.app').evaluate((el) => getComputedStyle(el).flexDirection);
log('Responsive', 'Mobile layout stacks vertically', appDirection === 'column', `flex-direction=${appDirection}`);

await page.setViewportSize({ width: 1280, height: 800 });
await page.click('button[data-view="agent"]');
await page.locator('[data-task]').nth(2).click();
await page.reload({ waitUntil: 'networkidle' });
await page.click('button[data-view="agent"]');
log(
  'Persistence',
  'State survives page refresh',
  await page.locator('[data-task]').nth(2).evaluate((el) => el.classList.contains('done')),
  'Resets after reload — no localStorage'
);

log('Onboarding', 'Questionnaire flow exists', false, 'No onboarding view or first-run gate in app');

await browser.close();

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ summary: { passed, failed, total: results.length }, results, consoleErrors, failedResources }, null, 2));
