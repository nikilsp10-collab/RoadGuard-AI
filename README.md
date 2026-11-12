# RoadGuard AI

Community-driven predictive road safety and hazard resolution platform built for the **Improving Road Safety Through Community Participation** challenge.

## Folder Structure
- `public/` — Responsive Citizen Portal, Interactive Map/Heatmap, Night-Audit Mode, Safe-Route Preview, Authority Admin Dashboard, and Analytics UI (`index.html`, `app.js`, `i18n.js`, `styles.css`)
- `api/reports.py` — Vercel-compatible Python serverless API (AI hazard classification, 30m duplicate clustering, priority scoring, community verification, SLA & Proof-of-Fix workflow)
- `data/seed_reports.json` — Initial sample hazard records covering all 5 core problem areas
- `dev_server.py` — Localhost server (`http://localhost:3000`)

## Run on Localhost
```powershell
python dev_server.py
```
Then open `http://localhost:3000` in your browser.

## Optional AI Vision Upgrade
Set `GEMINI_API_KEY` in your environment (locally or in Vercel Project Settings → Environment Variables) to enable live multimodal photo analysis via Gemini. Without a key, the built-in classifier handles hazard severity automatically.

## Deploy to Vercel
1. `git init`
2. `git add .`
3. `git commit -m "Initial RoadGuard AI prototype"`
4. Push to GitHub and import the repository in [Vercel](https://vercel.com).
