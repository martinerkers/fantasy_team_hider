# HLTV Fantasy Team Hider

A Chrome Manifest V3 extension for **money draft** that hides rival HLTV Fantasy lineups while rosters can still be changed. Your own team stays visible so you can draft, change players, assign roles, and use boosters. Live draft is outside the supported scope; there is no live-draft turn, auction, or player-pool handling.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the upper right.
3. Click **Load unpacked** and select this project's **extension** folder (the folder containing `manifest.json`).
4. Reload any open HLTV tabs, then visit a Fantasy game.

Alternatively, extract `dist/hltv-fantasy-team-hider.zip` and load its extracted folder. This is a local extension; it has not been published to the Chrome Web Store.

## Behavior

- Rival team detail pages are replaced with a notice before their content is painted. League navigation and the player selection interface remain available. Known lineup preview containers on league pages are also hidden.
- The extension reads `/fantasy/{gameId}/overview/json` with your current HLTV session. HLTV's `isGameStarted` flag must be true and `timeToDraftEnd` must not be positive before other teams are revealed. It never reveals based on your computer's clock alone.
- It checks every 15 seconds and when you return to the tab. There can be a short delay after roster lock. If HLTV is unavailable, returns a challenge, or changes its response format, other lineups stay hidden.
- Your team is recognized from HLTV's authenticated `topMenuData.leagueTeams[].teamId` or the explicit **My team** navigation link. If HLTV doesn't expose these, open the extension popup and save your full Fantasy team URL. Saved URLs apply only to their game.
- The popup shows protection status and the draft deadline, lets you check again, and has an on/off switch. The deadline is informational; HLTV must confirm game start before revealing lineups.

## Scope and privacy

This changes what **you see in your browser**. It cannot hide your team from other HLTV users. Everyone who wants this behavior must install it themselves. It is a visual filter, not access control: the underlying page and HLTV responses still contain team data.

The only Chrome permission is `storage`, for the toggle and your saved team URLs. Scripts run only on `hltv.org` and `www.hltv.org`. No analytics, remote code, external services, or background worker. Requests go to the same HLTV origin as the current page.

## Development and verification

```powershell
npm.cmd install
npm.cmd test
npm.cmd run package
```

Tests use an installed Google Chrome with Playwright, mocked HLTV responses, and real browser DOM/CSS. They cover direct links, first-load protection, own-team exemptions, delayed starts, API failures, automatic reveal, game isolation, SPA navigation, dynamic previews, the toggle, and the popup.

The live API was checked against games 672 (started) and 673 (draft open) on November 10, 2026. Live frontend assets were unavailable to the development environment, so authenticated live-page rendering and HLTV's exact preview markup still need a manual check. If HLTV changes its routes, preview classes, or ownership schema, update the adapter in `extension/core.js` and preview selectors in `extension/content.css`. The popup's saved team URL provides a fallback for ownership recognition.

Manual check: visit an open game's own team and a rival team in separate tabs; confirm only the rival is hidden. Check league previews, role and booster editing, browser back/forward, and reveal after HLTV locks the draft. Refresh the extension and HLTV tabs after changing its files.
