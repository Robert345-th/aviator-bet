# Aviator Odds Collector (Bwanabet + Bongobet)

Three pieces:

1. **`tampermonkey-odds-collector.user.js`** — runs in your browser on the live Aviator page, reads the multiplier, and POSTs finished rounds to your Railway service.
2. **`server/`** — Node/Express + PostgreSQL service on Railway. Stores every round in an `odds_log` table and pushes each new round out live.
3. **`server/public/`** — a full PWA dashboard, installable to your home screen, same as your other Railway apps.

## 1. Push to GitHub

```bash
cd aviator-odds-collector
git init
git add .
git commit -m "Aviator odds collector: Tampermonkey script + Railway server + PWA dashboard"
git branch -M main
git remote add origin https://github.com/Robert345-th/YOUR-REPO-NAME.git
git push -u origin main
```

## 2. Deploy the server to Railway

1. In Railway: **New Project → Deploy from GitHub repo**, point it at this repo's `server/` folder as the root.
2. Add a **PostgreSQL** plugin — Railway auto-injects `DATABASE_URL`.
3. Add an environment variable `API_KEY`. A key's already generated for you (below) — keep it or swap in your own.
4. Deploy. The `odds_log` table is created automatically on first boot.
5. Confirm it's up: visit `https://YOUR-SERVICE.up.railway.app/health` — should say "Aviator odds collector is running".

## 3. Install the Tampermonkey script

1. Open `tampermonkey-odds-collector.user.js`, install it in Tampermonkey.
2. Edit `COLLECTOR_URL` at the top to your Railway URL + `/api/odds`. The `API_KEY` is already filled in to match the server's default.
3. **The multiplier selectors will need tuning per platform.** Open devtools on the live game, inspect the big multiplier number (e.g. "2.34x"), and add its exact CSS selector to the top of `MULTIPLIER_SELECTORS` in the script. Do the same for the "crashed" detection text if your platform doesn't say "flew away" or "crashed".
4. Update the `@match` line if Bongobet's real domain differs from what's in the script.

## 4. Install the dashboard as a PWA

1. Visit `https://YOUR-SERVICE.up.railway.app/` on your phone.
2. Enter the collector key once (below) — it's saved on the device, so you won't be asked again.
3. Use your browser's **Add to Home Screen** (or the install prompt Chrome shows automatically) — it now opens full-screen like a native app, same as your other Railway apps.

Rounds appear the moment the Tampermonkey script posts them — no refresh needed. Use the All / Bwanabet / Bongobet tabs to filter. Multipliers ≥10x are called out in amber, sub-1.5x rounds in grey. "Forget key on this device" at the bottom signs you out.

## Your generated collector key

```
749cd6292a502b36400c49a5f316d4da04c78ba056611f6f
```

This is already set in `server/.env.example` and in the Tampermonkey script — it's what the dashboard asks for on first visit, and what proves a request to `/api/odds` actually came from you. Treat it like a password. If this repo will ever be public on GitHub, generate a fresh one (`openssl rand -hex 24`) and swap it into the script, `.env.example`, and Railway's env var instead of committing this one.

## Notes

- The script keeps a local retry queue (`GM_setValue`) so a dropped connection doesn't lose rounds — it retries every 15s.
- Both platforms post to the same endpoint; `platform` is auto-detected from the tab's hostname.
- The service worker caches only the app shell (HTML/manifest/icons) for offline installability — `/api/*` calls always go live, never from cache.
- The placeholder icons in `server/public/icons/` are simple generated graphics — swap them for your own branding whenever you like.
