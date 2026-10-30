# Spool — Spotify playlist companion

A mobile-first browser app for browsing Spotify playlists, exporting playlist metadata, and saving audio files that users already own or are authorized to download.

## What it does
- Spotify sign-in using OAuth Authorization Code with PKCE (no client secret in the browser).
- Browse the signed-in user's playlists and track listings.
- Export playlist metadata as CSV, JSON, or M3U.
- Add personal audio files to a persistent IndexedDB library in the browser; remove or save them back to your device.
- Search playlists and select individual tracks before exporting.
- Responsive dark/light interface.

## Important Spotify limitation
Spotify's Web API provides playlist and track metadata, not downloadable audio files. This app does **not** rip, record, or bypass Spotify's protected playback. M3U exports contain Spotify track URLs, not MP3 files. Spotify Premium offline downloads remain available in the official Spotify app.

## Run locally
Serve this folder over localhost (OAuth requires a registered redirect URI):
```bash
python -m http.server 8080
```
Open http://localhost:8080.

## Configure Spotify
1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copy its **Client ID**.
3. Add your exact local URL (for example `http://localhost:8080/`) under Redirect URIs in the app settings.
4. Open Spool, press **Connect Spotify**, and paste the Client ID when prompted.
5. For a deployed site, add the exact HTTPS site URL as another Redirect URI.

The Client ID is public by design. Never put a Spotify client secret in this static frontend.

## Deploy
Deploy the repository as a static site on Netlify, Vercel, or GitHub Pages. Add the deployed URL (including its path and trailing slash, if applicable) to the Spotify app's Redirect URIs.

## Privacy
Playlist data is fetched directly from Spotify in the browser. Access tokens are kept in the current browser session. Audio files selected by the user are stored in the browser's IndexedDB database and are not uploaded to a server. Clearing site data or using another browser/device removes or does not carry over that local library.