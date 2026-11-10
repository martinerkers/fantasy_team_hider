(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let tabId;
  let status;

  async function send(type) {
    try { return await chrome.tabs.sendMessage(tabId, { type }); } catch { return null; }
  }

  function render(value) {
    status = value;
    const modes = {
      outside: ['READY', 'Open an HLTV Fantasy game', 'Protection runs on HLTV Fantasy pages. Reload existing tabs after installing.'],
      disabled: ['PAUSED', 'Lineup hiding is off', 'Turn it on to hide other teams before roster lock.'],
      started: ['REVEALED', 'The game has started', 'HLTV confirms the draft is closed. All lineups are visible.'],
      waiting: ['PROTECTED', 'Waiting for roster lock', 'Other teams stay hidden. Your own team remains visible.'],
      unknown: ['PROTECTED', 'Waiting for confirmation', 'HLTV’s game status is unavailable. Rival lineups stay hidden; we’ll keep checking.']
    };
    const [badge, title, detail] = modes[value?.mode || 'outside'];
    $('badge').textContent = badge;
    $('status-title').textContent = title;
    $('status-detail').textContent = detail;
    $('refresh').disabled = !value?.gameId;
    $('deadline').hidden = !value?.draftEndsAt;
    if (value?.draftEndsAt) $('deadline').textContent = `Draft deadline: ${new Date(value.draftEndsAt).toLocaleString()}. We confirm the lock with HLTV before revealing.`;
  }

  async function initialize() {
    const stored = await chrome.storage.local.get({ enabled: true, ownTeamUrls: {} });
    $('enabled').checked = stored.enabled !== false;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    render(await send('fth-status'));
    if (status?.gameId) $('own-team').value = stored.ownTeamUrls[status.gameId] || status.ownTeamUrl || '';
  }

  $('enabled').addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: $('enabled').checked });
    render(await send('fth-status'));
  });
  $('refresh').addEventListener('click', async () => {
    $('refresh').disabled = true;
    $('refresh').textContent = 'Checking HLTV…';
    render(await send('fth-refresh'));
    $('refresh').textContent = 'Check status again';
  });
  $('own-team-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('own-team').value.trim();
    const parsed = FantasyHider.route(input);
    if (!input.startsWith('https://') || !parsed?.teamId || !parsed.leagueId) {
      $('feedback').textContent = 'Paste the full HLTV Fantasy team URL, including /league/…/team/…';
      return;
    }
    const { ownTeamUrls = {} } = await chrome.storage.local.get('ownTeamUrls');
    ownTeamUrls[parsed.gameId] = new URL(input).href;
    await chrome.storage.local.set({ ownTeamUrls });
    $('feedback').textContent = 'Your team is saved and will stay visible.';
    render(await send('fth-status'));
  });
  $('clear').addEventListener('click', async () => {
    const gameId = FantasyHider.route($('own-team').value)?.gameId || status?.gameId;
    if (!gameId) return;
    const { ownTeamUrls = {} } = await chrome.storage.local.get('ownTeamUrls');
    delete ownTeamUrls[gameId];
    await chrome.storage.local.set({ ownTeamUrls });
    $('own-team').value = '';
    $('feedback').textContent = 'Saved URL cleared. Automatic recognition is still active.';
    render(await send('fth-status'));
  });
  initialize().catch(() => { $('status-title').textContent = 'Reload the extension and try again'; });
})();
