# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"One More English" — a single-page PWA (no build step, no framework, no package.json) that teaches Korean users daily English patterns/words. It's served as static files (e.g. GitHub Pages). Everything the app needs lives in three files: `index.html` (markup + CSS + JS in one file), `sw.js` (service worker), `manifest.json` (PWA manifest).

## Commands

There is no build/lint/test tooling — this is plain HTML/CSS/JS served statically. To work on it locally, just open `index.html` in a browser or serve the directory with any static file server (e.g. `npx serve .`).

To manually generate a day's content (normally done by CI):
```
ANTHROPIC_API_KEY=xxx node scripts/generate.js [YYYY-MM-DD]
```
Defaults to today in KST if no date is given; skips generation if `content/YYYY-MM-DD.json` already exists.

## Architecture

**`index.html`** is the entire application: inline `<style>` for all CSS, inline `<script>` for all logic. It renders four tabs via a hand-rolled `TAB` state machine and a single `render()` dispatcher — there is no router or component framework:
- **Today** — read-only, pulls from `content/YYYY-MM-DD.json` (see below).
- **Phrases** / **Words** / **Mindset** — user-authored content (patterns, vocab, mindset notes), added/edited/deleted via bottom-sheet modals (`openPatternForm`, `openVocabForm`, `openMindForm`).

**Two independent persistence layers, selected per-key by `listGet`/`listSet`:**
- `localStorage` (`DB.get`/`DB.set`, prefixed `ome_`) — used for everything device-local: theme, streak, notification prefs, cached day content, current tab/index.
- Firebase Realtime Database — used only for the three user-authored collections (`patterns`, `vocab`, `mind`), so a user's phrases/words/mindset notes sync across devices. Firebase config and a small `window.OMEcloud` wrapper (`watch`/`save`) are set up in a `<script type="module">` block near the top of `index.html`; the rest of the app talks to it only through `OMEcloud`, never the Firebase SDK directly. Local storage is kept as an offline mirror of the cloud data.

**Daily content pipeline (fully automated, no API key on-device):**
1. `.github/workflows/daily.yml` runs on a cron (`0 20 * * *` UTC = 05:00 KST) and on manual dispatch.
2. It runs `scripts/generate.js`, which calls the Anthropic Messages API (model `claude-haiku-4-5`) with a Korean-language prompt asking for 5 patterns (3 native everyday expressions + 2 fill-in-the-blank grammar patterns, in that array order) + 5 words as strict JSON, avoiding words/patterns already used (scanned from existing `content/*.json`).
3. The result is written to `content/YYYY-MM-DD.json` and `content/index.json` (a sorted array of all available date keys) is regenerated.
4. The workflow commits and pushes `content/` back to the repo — this is how new daily content reaches the static site with zero client-side API key exposure.
5. In the app, `fetchDay()` fetches `content/${key}.json` with `cache:'no-store'` and caches the parsed result into `localStorage` under `days`; the service worker additionally does network-first caching for any `/content/` request as a second-layer fallback for offline use.

**Service worker (`sw.js`)** uses a versioned cache name (`one-more-english-vNN` — bump this on asset changes to bust old caches). Fetch handling is deliberately branchy: `api.anthropic.com`/font/Firebase hosts always bypass cache; `/content/*` is network-first (falls back to cache offline); everything else is cache-first with a background network fill and an `index.html` fallback for navigation.

## Conventions specific to this codebase

- 단일 `index.html` 구조를 유지할 것 — HTML/CSS/JS를 별도 파일이나 빌드 단계로 분리하지 않는다.
- `index.html` 또는 `sw.js`를 수정할 때는 `sw.js`의 `CACHE` 버전 문자열(`one-more-english-vNN`)을 반드시 올린다 — 그렇지 않으면 기존 캐시가 새 자산을 가리지 못한다.
- 커밋 메시지는 한국어로 작성한다.
- 대화는 한국어로 진행한다.
- UI strings and comments are in Korean; keep new user-facing text and code comments consistent with that.
- `esc()` must wrap any user- or content-supplied string interpolated into HTML template strings — this app has no framework-level auto-escaping.
- Speaker buttons pass text through `spkBtn()`, which base64-encodes it into a `data-speak` attribute (avoids breaking on quotes/newlines); playback is wired via one delegated click listener on `#view`, not per-button `onclick`, and decodes back with `atob`/`decodeURIComponent(escape(...))`.
- When adding a new persisted collection, decide up front whether it's per-device (`localStorage` only) or cross-device (must be added to `CLOUD_KEYS` and go through `listGet`/`listSet`).
