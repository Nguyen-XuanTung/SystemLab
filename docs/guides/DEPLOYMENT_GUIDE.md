# Deployment Guide — SystemLab

SystemLab compiles to pure static assets (`dist/`) with zero backend dependencies.

---

## 1. GitHub Pages (Recommended)

A ready-to-use workflow is included at `.github/workflows/deploy-pages.yml` (target URL pattern: `https://<username>.github.io/SystemLab/`).

1. Push the repository to GitHub (e.g., `https://github.com/Nguyen-XuanTung/SystemLab`).
2. Open **Settings → Pages** in your GitHub repository and set **Source** to **GitHub Actions**.
3. Push to `main` (or trigger **Actions → Deploy Static Site to GitHub Pages → Run workflow**).
4. The workflow builds with `VITE_BASE_PATH=/${{ github.event.repository.name }}/` so all JS bundles, SVG icons, and ES module Web Workers resolve cleanly under the repository subpath with zero `localhost` runtime dependencies.

> For local demonstration, use `python scripts/run_demo.py` (strictly bound to `127.0.0.1:5200` with `VITE_BASE_PATH=./`). Static cloud hosting must never depend on port `5200` or Python.

### Local Subpath Build Verification (PowerShell)

```powershell
$env:VITE_BASE_PATH='/SystemLab/'
npm run build
Remove-Item Env:VITE_BASE_PATH
```

Verify `dist/index.html` links `/SystemLab/assets/...` and `dist/assets/simulation.worker-*.js` exists.

---

## 2. Cloudflare Pages / Vercel / Netlify

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:** None required (`VITE_BASE_PATH` defaults to `./`).
