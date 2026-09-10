# Aviator Odds Collector (Bwanabet + Bongobet)

Three pieces:

1. **`tampermonkey-odds-collector.user.js`** — runs in your browser on the live Aviator page, reads the multiplier, and POSTs finished rounds to your Railway service.
2. **`server/`** — Node/Express + PostgreSQL service on Railway. Stores every round in an `odds_log` table and pushes each new round out live.
3. **`server/public/dashboard.html`** — served by the same Railway service. Shows rounds arriving in real time.

## 1. Push to GitHub

```bash
cd aviator-odds-collector
git init
git add .
git commit -m "Aviator odds collector: Tampermonkey script + Railway server + dashboard"
git branch -M main
git remote add origin https://github.com/Robert345-th/YOUR-REPO-NAME.git
git push -u origin main
```

## 2. Deploy the server to Railway

1. In Railway: **New Project → Deploy from GitHub repo**, point it at this repo's `server/` folder as the root.
2. Add a **PostgreSQL** plugin to the project — Railway auto-injects `DATABASE_URL`.
3. Add an environment variable `API_KEY` — a key has already been generated for you (see below). You can keep it or swap in your own.
4. Deploy. The `odds_log` table is created automatically on first boot.
5. Confirm it's up: visit `https://YOUR-SERVICE.up.railway.app/health` — should say "Aviator odds collector is running".

## 3. Install the Tampermonkey script

1. Open `tampermonkey-odds-collector.user.js`, install it in Tampermonkey.
2. Edit `COLLECTOR_URL` at the top to your Railway URL + `/api/odds`. The `API_KEY` is already filled in to match the server's default.
3. **The multiplier selectors will need tuning per platform.** Open devtools on the live game, inspect the big multiplier number (e.g. "2.34x"), and add its exact CSS selector to the top of `MULTIPLIER_SELECTORS` in the script. Do the same for the "crashed" detection text if your platform doesn't say "flew away" or "crashed".
4. Update the `@match` line if Bongobet's real domain differs from what's in the script.

## 4. View the dashboard

Open:

```
https://YOUR-SERVICE.up.railway.app/dashboard.html?key=749cd6292a502b36400c49a5f316d4da04c78ba056611f6f
```

Rounds appear the moment the Tampermonkey script posts them — no refresh needed. Use the All / Bwanabet / Bongobet tabs to filter. Multipliers ≥10x are called out in amber, sub-1.5x rounds in grey.

## Your generated shared secret

```
749cd6292a502b36400c49a5f316d4da04c78ba056611f6f
```

This is already set in `server/.env.example` and in the Tampermonkey script. It's what proves a request to `/api/odds` and the dashboard actually came from you. Treat it like a password — if this repo will be public on GitHub, generate a fresh one (`openssl rand -hex 24`) and swap it in both places, and Railway's env var, instead of committing this one.

## Notes

- The script keeps a local retry queue (`GM_setValue`) so a dropped connection doesn't lose rounds — it retries every 15s.
- Both platforms post to the same endpoint; `platform` is auto-detected from the tab's hostname.
- The dashboard and the collector script share one API key — anyone with the dashboard link can read your data, so don't post that URL anywhere public.
