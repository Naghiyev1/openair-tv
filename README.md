# OpenAir TV

A clean, static, GitHub Pages-friendly rebuild of the Lovable live TV player.

## What it keeps from the current app

- Country picker
- Live TV by country
- Sports playlist
- Adult playlist with confirmation gate
- Custom M3U playlist URL
- M3U parsing
- Search/filtering
- HLS playback with `hls.js`
- Automatic fallback to the next channel when a stream fails
- Filtering out streams that need custom browser headers, because normal browsers cannot send those headers from a static frontend

## Added improvements

- Better mobile layout
- Favorites
- Recently watched channels
- Cleaner codebase without Lovable, TanStack Start, Cloudflare, SSR, or server files
- GitHub Pages deployment workflow included

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy on GitHub Pages

1. Create a new GitHub repository, for example `openair-tv`.
2. Upload/push these files.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push to the `main` branch.
6. The workflow in `.github/workflows/deploy.yml` will build and deploy the app.

The app uses `base: './'` in `vite.config.ts`, so it should work under any GitHub Pages repository path.

## Notes

This app uses public playlist data from iptv-org. Some streams may fail, disappear, geo-block, or require headers that browsers cannot set. That is a stream/source limitation, not a GitHub Pages problem.
