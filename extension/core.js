/* Shared by the content script and popup; no page scripts or remote code. */
(() => {
  "use strict";
  const readId = value => {
    const raw = value && typeof value === "object" ? value.id : value;
    return /^\d+$/.test(String(raw)) ? String(raw) : null;
  };

  function route(value) {
    let url;
    try { url = new URL(value, "https://www.hltv.org"); } catch { return null; }
    if (!['hltv.org', 'www.hltv.org'].includes(url.hostname) || url.protocol !== 'https:') return null;
    const match = url.pathname.match(/^\/fantasy\/(\d+)(?:\/|$)/);
    if (!match) return null;
    const team = url.pathname.match(/\/team\/(\d+)(?:\/|$)/);
    const league = url.pathname.match(/\/league\/(\d+)(?:\/|$)/);
    return { gameId: match[1], teamId: team?.[1] || null, leagueId: league?.[1] || null, path: url.pathname };
  }

  function parseOverview(data, gameId, now = Date.now()) {
    // Validate the response identity and schema before trusting a reveal signal.
    if (readId(data?.topMenuData?.fantasyId) !== gameId || typeof data.isGameStarted !== 'boolean') {
      throw new Error('HLTV returned an unrecognized game status.');
    }
    const remaining = data.timeToDraftEnd;
    if (remaining !== null && (typeof remaining !== 'number' || !Number.isFinite(remaining))) {
      throw new Error('HLTV returned an unrecognized draft countdown.');
    }
    const draftOpen = typeof remaining === 'number' && Number.isFinite(remaining) && remaining > 0;
    const ownTeams = (Array.isArray(data.topMenuData.leagueTeams) ? data.topMenuData.leagueTeams : [])
      .map(team => readId(team.teamId)).filter(Boolean);
    return {
      // A positive draft countdown always wins over conflicting started data.
      started: data.isGameStarted === true && !draftOpen,
      draftEndsAt: draftOpen ? now + remaining : null,
      ownTeams,
      title: typeof data.fantasyHeader === 'string' ? data.fantasyHeader : 'HLTV Fantasy',
      checkedAt: now
    };
  }

  function isOwnTeam(current, snapshot, saved) {
    if (!current?.teamId) return false;
    return snapshot?.ownTeams.includes(current.teamId) ||
      route(saved)?.gameId === current.gameId && route(saved)?.teamId === current.teamId;
  }

  globalThis.FantasyHider = { route, parseOverview, isOwnTeam };
})();
