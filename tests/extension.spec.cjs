const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../extension', name), 'utf8');
const core = source('core.js');
const content = source('content.js');
const css = source('content.css');
const teamUrl = 'https://www.hltv.org/fantasy/673/league/220533/team/42';
const openGame = {
  topMenuData: { fantasyId: { id: 673 }, leagueTeams: [{ teamId: { id: 7 } }] },
  isGameStarted: false, timeToDraftEnd: 60000, fantasyHeader: 'Test event'
};

async function mount(page, { url = teamUrl, data = openGame, saved = {}, failed = false, pending = false } = {}) {
  const state = { data, failed, pending };
  await page.clock.install();
  await page.route('https://www.hltv.org/**', async request => {
    if (request.request().url().endsWith('/overview/json')) {
      if (state.pending) return; // Explicitly unresolved, to test the first-paint guard.
      return request.fulfill({ status: state.failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(state.data) });
    }
    return request.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${css}</style></head><body><main class="contentCol"><div id="fantasy"><nav><a href="/fantasy/673/league/220533/team/7">My team</a></nav><div class="team-overview">RIVAL SECRET PICKS</div><form id="editor">Player editor</form></div></main></body></html>` });
  });
  await page.addInitScript(({ core, content, saved }) => {
    const stored = { enabled: true, ownTeamUrls: saved };
    const changes = [];
    window.chrome = {
      storage: {
        local: {
          async get() { return stored; },
          async set(values) {
            const change = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
            Object.assign(stored, values);
            changes.forEach(fn => fn(change, 'local'));
          }
        },
        onChanged: { addListener(fn) { changes.push(fn); } }
      },
      runtime: { onMessage: { addListener(fn) { window.getHiderStatus = () => new Promise(resolve => fn({ type: 'fth-status' }, null, resolve)); } } }
    };
    // Content scripts run once the root element exists at document_start.
    const start = () => { (0, eval)(core); (0, eval)(content); };
    if (document.documentElement) start();
    else new MutationObserver((_, observer) => { if (document.documentElement) { observer.disconnect(); start(); } }).observe(document, { childList: true });
  }, { core, content, saved });
  await page.goto(url);
  return state;
}

test('hides an opponent before roster lock, including a direct URL', async ({ page }) => {
  await mount(page);
  await expect(page.locator('#fantasy')).toBeHidden();
  await expect(page.locator('#fth-notice')).toContainText('Lineup hidden');
  await expect.poll(() => page.evaluate(async () => (await getHiderStatus()).mode)).toBe('waiting');
});

test('keeps own team and player editor visible from authenticated API data', async ({ page }) => {
  await mount(page, { url: teamUrl.replace('/42', '/7') });
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('.team-overview')).toBeVisible();
  await expect(page.locator('#fth-notice')).toHaveCount(0);
});

test('recognizes an explicit My team link even if the API list is empty', async ({ page }) => {
  await mount(page, { url: teamUrl.replace('/42', '/7'), data: { ...openGame, topMenuData: { fantasyId: { id: 673 }, leagueTeams: [] } } });
  await expect(page.locator('#editor')).toBeVisible();
});

test('saved own-team URL remains visible when HLTV is unavailable', async ({ page }) => {
  await mount(page, { saved: { 673: teamUrl }, failed: true });
  await expect(page.locator('.team-overview')).toBeVisible();
});

test('a saved team for another game cannot exempt this game', async ({ page }) => {
  await mount(page, { saved: { 672: teamUrl.replace('/673/', '/672/') } });
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('reveals automatically when a later HLTV check confirms game start', async ({ page }) => {
  const state = await mount(page);
  await expect(page.locator('#fth-notice')).toBeVisible();
  state.data = { ...openGame, isGameStarted: true, timeToDraftEnd: null };
  await page.clock.runFor(15000);
  await expect(page.locator('#fantasy')).toBeVisible();
  await expect(page.locator('.team-overview')).toBeVisible();
  await expect(page.locator('#fth-notice')).toHaveCount(0);
});

test('deadline passage alone does not reveal picks during a delay', async ({ page }) => {
  await mount(page, { data: { ...openGame, timeToDraftEnd: 100 } });
  await expect(page.locator('#fth-notice')).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('positive draft countdown overrides contradictory started flag', async ({ page }) => {
  await mount(page, { data: { ...openGame, isGameStarted: true } });
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('unknown response schema and wrong game identity stay hidden', async ({ page }) => {
  await mount(page, { data: { ...openGame, isGameStarted: true, timeToDraftEnd: null, topMenuData: { fantasyId: { id: 999 } } } });
  await expect.poll(() => page.evaluate(async () => (await getHiderStatus()).mode)).toBe('unknown');
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('hides picks while the initial status request is pending', async ({ page }) => {
  await mount(page, { pending: true });
  await expect(page.locator('#fantasy')).toBeHidden();
  await expect(page.locator('#fth-notice')).toBeVisible();
});

test('missing countdown cannot reveal rivals after an API schema change', async ({ page }) => {
  const data = { ...openGame, isGameStarted: true };
  delete data.timeToDraftEnd;
  await mount(page, { data });
  await expect.poll(() => page.evaluate(async () => (await getHiderStatus()).mode)).toBe('unknown');
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('rechecks failures and hides previously visible rival picks', async ({ page }) => {
  const state = await mount(page, { data: { ...openGame, isGameStarted: true, timeToDraftEnd: null } });
  await expect(page.locator('#fantasy')).toBeVisible();
  state.failed = true;
  await page.clock.runFor(15000);
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('handles SPA navigation from own team to opponent and another game', async ({ page }) => {
  await mount(page, { url: teamUrl.replace('/42', '/7') });
  await expect(page.locator('#editor')).toBeVisible();
  await page.evaluate(url => { history.pushState({}, '', url); document.querySelector('#editor').textContent = 'New rival content'; }, teamUrl);
  await expect(page.locator('#fantasy')).toBeHidden();
  await page.evaluate(() => { history.pushState({}, '', '/fantasy/999/league/1/team/7'); document.querySelector('#editor').textContent = 'Different game'; });
  await expect(page.locator('#fantasy')).toBeHidden();
  await expect(page.locator('#fth-notice a').first()).toHaveAttribute('href', '/fantasy/999/overview');
});

test('preserves league navigation and conceals dynamically added previews', async ({ page }) => {
  await mount(page, { url: 'https://www.hltv.org/fantasy/673/league/220533' });
  await expect(page.locator('#fantasy nav')).toBeVisible();
  await page.evaluate(() => { const preview = document.createElement('div'); preview.className = 'team-preview'; preview.textContent = 'Secret players'; document.querySelector('#fantasy').append(preview); });
  await expect(page.locator('.team-preview')).toBeHidden();
});

test('toggle restores content and re-enables protection immediately', async ({ page }) => {
  await mount(page);
  await expect(page.locator('#fantasy')).toBeHidden();
  await page.evaluate(() => chrome.storage.local.set({ enabled: false }));
  await expect(page.locator('.team-overview')).toBeVisible();
  await page.evaluate(() => chrome.storage.local.set({ enabled: true }));
  await expect(page.locator('#fantasy')).toBeHidden();
});

test('non-fantasy pages are unaffected', async ({ page }) => {
  await mount(page, { url: 'https://www.hltv.org/news/123/example' });
  await expect(page.locator('#editor')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await getHiderStatus()).mode)).toBe('outside');
});

test('popup saves only valid HLTV team URLs and persists the toggle', async ({ page }) => {
  await page.route('https://extension.test/**', request => {
    const file = new URL(request.request().url()).pathname.slice(1) || 'popup.html';
    return request.fulfill({ body: source(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.addInitScript(() => {
    window.stored = { enabled: true, ownTeamUrls: {} };
    window.chrome = {
      storage: { local: {
        async get() { return window.stored; },
        async set(value) { Object.assign(window.stored, value); }
      } },
      tabs: {
        async query() { return [{ id: 1 }]; },
        async sendMessage() { return { mode: window.stored.enabled ? 'waiting' : 'disabled', gameId: '673' }; }
      }
    };
  });
  await page.goto('https://extension.test/popup.html');
  await expect(page.locator('#status-title')).toHaveText('Waiting for roster lock');
  await page.locator('#own-team').fill('https://example.com/fantasy/673/league/1/team/1');
  await page.getByRole('button', { name: 'Save my team' }).click();
  await expect(page.locator('#feedback')).toContainText('Paste the full HLTV');
  await page.locator('#own-team').fill(teamUrl);
  await page.getByRole('button', { name: 'Save my team' }).click();
  await expect.poll(() => page.evaluate(() => stored.ownTeamUrls['673'])).toBe(teamUrl);
  await page.locator('#enabled').uncheck();
  await expect(page.locator('#status-title')).toHaveText('Lineup hiding is off');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(stored.ownTeamUrls).length)).toBe(0);
});
