# Spool — Personal Media Studio

Spool is a mobile-first media workspace built with **React, TypeScript and Vite**.

## Frontend stack
- React 19 + TypeScript
- Vite 6
- Framer Motion for restrained interface transitions
- Lucide React icons
- Responsive custom CSS design system

## Features
- Public TikTok, Instagram and X post link retrieval through the Spool yt-dlp API.
- Browser-based MP3 extraction using FFmpeg.wasm. Video files are processed locally.
- Local music library backed by IndexedDB, including import, search, playlists and playback.
- Dark and light themes.
- Responsive layouts for phones, tablets and desktop.

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

Netlify builds with `npm run build` and publishes the `dist` directory. The social media API is deployed separately on Render from `media-api/` using `render.yaml`.

## Privacy and permissions
Imported music is stored in this browser on this device. MP3 conversion happens in the browser. Social link retrieval is handled by the separately hosted API. Only download media you own or are authorized to use.
