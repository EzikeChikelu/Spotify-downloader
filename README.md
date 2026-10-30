# Spool — Your music, your way

Spool is a browser-based personal music library. Import audio files you own or are authorized to use, organize them into playlists, listen with the built-in player, and export playlist files.

- Import audio from your phone or computer.
- Keep audio in browser storage (IndexedDB); no server upload.
- Create playlists, search tracks, and sort your collection.
- Listen in the browser and save imported files back to your device.
- Export playlist tracklists as M3U.

No Spotify login, Spotify Developer Client ID, Spotify API, or Premium subscription is required. Spool does not rip or download protected streaming audio. Only import and share music you own or have permission to use.

## Run locally
Run `python -m http.server 8080` and open `http://localhost:8080`.

## Deploy
Deploy as a static site on Netlify, Vercel, or GitHub Pages. No environment variables or backend service are required.

## Privacy
Audio stays in the current browser/device and does not sync automatically. Clearing site data may remove the local library. Browser storage limits and supported playback formats vary by device.