(() => {
  'use strict';
  const { route, parseOverview, isOwnTeam } = FantasyHider;
  const root = document.documentElement;
  const snapshots = new Map();
  const requests = new Map();
  let settings = { enabled: true, ownTeamUrls: {} };
  let settingsReady = false;
  let activeGame = null;
  let notice;
  let lastStatus;

  function knownOwnUrls(current, snapshot) {
    const saved = settings.ownTeamUrls[current.gameId];
    if (saved) return saved;
    const id = snapshot?.ownTeams[0];
    if (!id) return null;
    const link = [...document.querySelectorAll('#fantasy a[href]')]
      .find(a => route(a.href)?.gameId === current.gameId && route(a.href)?.teamId === id);
    return link?.href || null;
  }

  function detectOwnLinks(current, snapshot) {
    if (!snapshot) return;
    // Only HLTV's explicit My team navigation is an ownership signal.
    for (const link of document.querySelectorAll('#fantasy a[href]')) {
      if (!/^my team$/i.test(link.textContent.trim())) continue;
      const target = route(link.href);
      if (target?.gameId === current.gameId && target.teamId && !snapshot.ownTeams.includes(target.teamId)) {
        snapshot.ownTeams.push(target.teamId);
      }
    }
  }

  function update() {
    const current = route(location.href);
    const enabled = settings.enabled !== false;
    if (!current) {
      root.dataset.fthReady = 'true';
      root.dataset.fthPage = 'other';
      root.dataset.fthProtect = 'false';
      notice?.remove();
      notice = null;
      lastStatus = { mode: 'outside', enabled };
      activeGame = null;
      return;
    }
    const snapshot = snapshots.get(current.gameId);
    detectOwnLinks(current, snapshot);
    const own = isOwnTeam(current, snapshot, settings.ownTeamUrls[current.gameId]);
    // Do not keep an old "started" response forever if the connection is lost.
    const fresh = snapshot && Date.now() - snapshot.checkedAt < 90000;
    const started = fresh && snapshot.started;
    const protectedPage = enabled && (!started || !settingsReady);
    const blocked = protectedPage && !!current.teamId && !own;
    root.dataset.fthPage = blocked ? 'blocked' : own ? 'own' : 'visible';
    root.dataset.fthProtect = String(protectedPage);
    root.dataset.fthReady = 'true';
    lastStatus = {
      enabled, gameId: current.gameId, gameTitle: snapshot?.title,
      mode: !enabled ? 'disabled' : started ? 'started' : snapshot && fresh ? 'waiting' : 'unknown',
      own: !!own, blocked, draftEndsAt: snapshot?.draftEndsAt,
      ownTeamUrl: knownOwnUrls(current, snapshot), error: snapshot?.error || null
    };
    renderNotice(current);
    if (activeGame !== current.gameId) {
      activeGame = current.gameId;
      void refresh(current.gameId);
    }
  }

  function renderNotice(current) {
    const host = document.querySelector('#fantasy, .fantasy');
    if (!host || !lastStatus.blocked) {
      notice?.remove();
      notice = null;
      return;
    }
    if (!notice?.isConnected) {
      notice = document.createElement('aside');
      notice.id = 'fth-notice';
      notice.setAttribute('role', 'status');
      const heading = document.createElement('strong');
      heading.textContent = 'Lineup hidden until the game starts';
      const description = document.createElement('p');
      const overview = document.createElement('a');
      overview.textContent = 'Fantasy overview';
      overview.href = `/fantasy/${current.gameId}/overview`;
      const myTeam = document.createElement('a');
      myTeam.dataset.fthMyTeam = '';
      myTeam.textContent = 'My team';
      const retry = document.createElement('button');
      retry.textContent = 'Check HLTV again';
      retry.addEventListener('click', () => { void refresh(route(location.href)?.gameId); });
      notice.append(heading, description, overview, myTeam, retry);
      host.before(notice);
    }
    const description = lastStatus.mode === 'unknown'
      ? 'Waiting for HLTV to confirm the game status. Rival lineups stay hidden. Your own team can be set in the extension popup.'
      : 'Roster changes are still open. Other teams will appear automatically once HLTV confirms the game has started. Your own team stays visible.';
    const paragraph = notice.querySelector('p');
    if (paragraph.textContent !== description) paragraph.textContent = description;
    const link = notice.querySelector('[data-fth-my-team]');
    const overviewLink = notice.querySelector('a');
    const overviewPath = `/fantasy/${current.gameId}/overview`;
    if (overviewLink.getAttribute('href') !== overviewPath) overviewLink.setAttribute('href', overviewPath);
    const ownUrl = lastStatus.ownTeamUrl;
    if (link.hidden !== !ownUrl) link.hidden = !ownUrl;
    if (ownUrl && link.href !== ownUrl) link.href = ownUrl;
  }

  async function refresh(gameId) {
    if (!gameId || requests.has(gameId)) return requests.get(gameId);
    const request = (async () => {
      try {
        const response = await fetch(`/fantasy/${gameId}/overview/json`, {
          credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000)
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('HLTV could not confirm the game status.');
        }
        snapshots.set(gameId, parseOverview(await response.json(), gameId));
      } catch (error) {
        // Failed checks must never accidentally reveal opponents.
        const old = snapshots.get(gameId);
        snapshots.set(gameId, { ownTeams: old?.ownTeams || [], started: false, checkedAt: 0, error: error.message });
      } finally {
        requests.delete(gameId);
        update();
      }
    })();
    requests.set(gameId, request);
    return request;
  }

  chrome.storage.local.get({ enabled: true, ownTeamUrls: {} }).then(value => {
    settings = value;
    settingsReady = true;
    update();
  }).catch(() => { settingsReady = true; update(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.ownTeamUrls) settings.ownTeamUrls = changes.ownTeamUrls.newValue || {};
    update();
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'fth-status') { update(); respond(lastStatus); }
    if (message.type === 'fth-refresh') {
      refresh(route(location.href)?.gameId).then(() => respond(lastStatus));
      return true;
    }
  });
  new MutationObserver(update).observe(root, { childList: true, subtree: true });
  // Also catches history navigation which does not mutate the page immediately.
  setInterval(update, 250);
  setInterval(() => {
    const current = route(location.href);
    if (current && settings.enabled !== false) void refresh(current.gameId);
  }, 15000);
  addEventListener('popstate', update);
  addEventListener('pageshow', update);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { update(); void refresh(route(location.href)?.gameId); }
  });
  update();
})();
