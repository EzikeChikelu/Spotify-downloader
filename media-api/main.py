import os
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import quote

import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(title="Spool Free Media API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

ALLOWED = ("tiktok.com", "instagram.com", "x.com", "twitter.com")

def validate_url(value: str) -> str:
    from urllib.parse import urlparse
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not any(host == d or host.endswith("." + d) for d in ALLOWED):
        raise HTTPException(status_code=400, detail="Only public TikTok, Instagram and X post URLs are supported.")
    return value

def base_options():
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 25,
        "retries": 1,
        "extractor_retries": 1,
        "ignoreerrors": False,
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "spool-ytdlp-api"}

@app.get("/info")
def info(request: Request, url: str = Query(..., max_length=2048)):
    validate_url(url)
    try:
        with yt_dlp.YoutubeDL(base_options()) as ydl:
            info = ydl.extract_info(url, download=False)
        if not info:
            raise HTTPException(status_code=404, detail="No media was found for this post.")
        title = info.get("title") or info.get("description") or "Social media post"
        duration = info.get("duration") or 0
        thumbnail = info.get("thumbnail")
        base = str(request.base_url).rstrip("/")
        videos, audios = [], []
        formats = info.get("formats") or []
        best_video = next((f for f in reversed(formats) if f.get("url") and f.get("vcodec") != "none" and f.get("acodec") != "none" and (f.get("ext") == "mp4" or f.get("protocol") in ("https", "http"))), None)
        if not best_video:
            best_video = next((f for f in reversed(formats) if f.get("url") and f.get("vcodec") != "none"), None)
        best_audio = next((f for f in reversed(formats) if f.get("url") and f.get("acodec") != "none" and f.get("vcodec") == "none"), None)
        if best_video:
            videos.append({"url": base + "/download?url=" + quote(url, safe="") + "&kind=video", "quality": best_video.get("format_note") or best_video.get("resolution") or "Best available"})
        if best_audio:
            audios.append({"url": base + "/download?url=" + quote(url, safe="") + "&kind=audio", "quality": "Audio only"})
        if not videos and not audios and info.get("url"):
            videos.append({"url": base + "/download?url=" + quote(url, safe="") + "&kind=best", "quality": "Best available"})
        return {"status": "ok", "data": {"platform": info.get("extractor_key", "social"), "title": title[:240], "thumbnail": thumbnail, "duration": duration, "videos": videos, "audios": audios, "images": []}}
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "login" in message.lower() or "private" in message.lower():
            raise HTTPException(status_code=403, detail="This post is private or requires login. Only public posts can be downloaded.")
        raise HTTPException(status_code=422, detail="yt-dlp could not access this post. It may be private, restricted, deleted, or unsupported.")

@app.get("/download")
def download(url: str = Query(..., max_length=2048), kind: str = Query("video", pattern="^(video|audio|best)$")):
    validate_url(url)
    temp_dir = tempfile.mkdtemp(prefix="spool-")
    output = str(Path(temp_dir) / "%(title).80s-%(id)s.%(ext)s")
    opts = base_options()
    opts.update({
        "outtmpl": output,
        "format": "bestaudio/best" if kind == "audio" else ("best[ext=mp4]/best" if kind in ("video", "best") else "best"),
        "max_filesize": 500 * 1024 * 1024,
    })
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.extract_info(url, download=True)
            filepath = Path(ydl.prepare_filename(result))
            if not filepath.exists():
                matches = list(Path(temp_dir).glob("*"))
                if not matches:
                    raise RuntimeError("Download output was not created.")
                filepath = matches[0]
        safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", filepath.name)[:120] or "spool-media"
        return FileResponse(filepath, filename=safe_name, background=BackgroundTask(shutil.rmtree, temp_dir, ignore_errors=True), media_type="application/octet-stream")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail="Download failed. The post may be restricted, unavailable, or unsupported.")
