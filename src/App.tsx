import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp,
  Disc3, Download, FileAudio, FileVideo, FolderOpen, Headphones, Link2,
  ListMusic, LoaderCircle, Moon, Music2, Pause, Play, Plus, Search, Settings2,
  ShieldCheck, Sun, Trash2, Upload, Video, X, Zap
} from "lucide-react";

type Tab = "links" | "extract" | "library";
type Track = { id: string; name: string; filename: string; size: number; duration: number; addedAt: number; file: File };
type Playlist = { id: string; name: string; ids: string[] };
type MediaOption = { url: string; quality?: string };
type MediaPayload = { status: string; data?: { title?: string; thumbnail?: string; duration?: number; videos?: MediaOption[]; audios?: MediaOption[]; images?: MediaOption[] }; detail?: string };

const API = "https://spool-media-api-ezikechikelu.onrender.com";
const DB_NAME = "spool-local-audio";
const formatTime = (n: number) => { const s = Math.floor(Number(n) || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const formatSize = (n: number) => n > 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + " GB" : n > 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + " MB" : (n / 1024).toFixed(0) + " KB";
const id = () => crypto.randomUUID();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbRequest<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getPlatform(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (["x.com", "twitter.com"].some(d => host === d || host.endsWith("." + d))) return "X";
  } catch { /* invalid URL */ }
  return null;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("links");
  const [light, setLight] = useState(() => localStorage.getItem("spool-theme") === "light");
  const [url, setUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [media, setMedia] = useState<MediaPayload["data"] | null>(null);
  const [mediaPlatform, setMediaPlatform] = useState("");
  const [toast, setToast] = useState("");
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [search, setSearch] = useState("");
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [converted, setConverted] = useState<string | null>(null);
  const [convertedName, setConvertedName] = useState("");
  const [convertError, setConvertError] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const playlistTracks = useMemo(() => selectedPlaylist ? tracks.filter(t => playlists.find(p => p.id === selectedPlaylist)?.ids.includes(t.id)) : tracks, [tracks, playlists, selectedPlaylist]);
  const visibleTracks = useMemo(() => playlistTracks.filter(t => (t.name + " " + t.filename).toLowerCase().includes(search.toLowerCase())), [playlistTracks, search]);

  useEffect(() => { openDB().then(async database => { setDb(database); setTracks(await dbRequest<Track[]>(database, "files", "readonly", s => s.getAll())); setPlaylists(await dbRequest<Playlist[]>(database, "playlists", "readonly", s => s.getAll())); }).catch(() => notify("Local music storage is unavailable.")); }, []);
  useEffect(() => { document.documentElement.dataset.theme = light ? "light" : "dark"; localStorage.setItem("spool-theme", light ? "light" : "dark"); }, [light]);
  useEffect(() => { if (!video) { setVideoPreview(""); return; } const objectUrl = URL.createObjectURL(video); setVideoPreview(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [video]);
  useEffect(() => { return () => { if (converted) URL.revokeObjectURL(converted); }; }, [converted]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2800); }
  async function submitLink(event: React.FormEvent) {
    event.preventDefault(); setMedia(null); setLinkError("");
    let parsed: URL;
    try { parsed = new URL(url.trim()); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); } catch { setLinkError("Paste a complete, valid link to continue."); return; }
    const platform = getPlatform(parsed.href);
    if (!platform) { setLinkError("Spool currently supports public TikTok, Instagram and X post links."); return; }
    setLinkLoading(true); setMediaPlatform(platform);
    const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(API + "/info?url=" + encodeURIComponent(parsed.href), { signal: controller.signal, headers: { Accept: "application/json" } });
      const result = await response.json() as MediaPayload;
      if (!response.ok) throw new Error(result.detail || "The platform could not provide this post.");
      if (!result.data || !(result.data.videos?.length || result.data.audios?.length || result.data.images?.length)) throw new Error("No downloadable media was found in this post.");
      setMedia(result.data); notify("Your media is ready.");
    } catch (error) { setLinkError(error instanceof Error ? error.name === "AbortError" ? "The request timed out. Try again in a moment." : error.message : "Could not retrieve this post."); }
    finally { window.clearTimeout(timer); setLinkLoading(false); }
  }
  async function downloadFile(fileUrl: string, filename: string) {
    try { const response = await fetch(fileUrl); if (!response.ok) throw new Error("Download failed (" + response.status + ")."); const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = filename; anchor.click(); URL.revokeObjectURL(objectUrl); }
    catch { window.open(fileUrl, "_blank", "noopener,noreferrer"); }
  }
  async function convertVideo() {
    if (!video || converting) return;
    if (video.size > 250 * 1024 * 1024) { setConvertError("Choose a video under 250 MB for reliable on-device conversion."); return; }
    setConverting(true); setConvertProgress(0); setConvertError(""); setConverted(null);
    try {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")
      ]);
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress: value }) => setConvertProgress(Math.max(0, Math.min(99, Math.round(value * 100)))));
      const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
      const workerUrl = new URL("/ffmpeg-worker.js", window.location.origin).href;
      await ffmpeg.load({ classWorkerURL: workerUrl, coreURL: await toBlobURL(base + "/ffmpeg-core.js", "text/javascript"), wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm") });
      const ext = video.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const input = "spool_input." + ext; const output = "spool_audio.mp3";
      await ffmpeg.writeFile(input, new Uint8Array(await video.arrayBuffer()));
      const result = await ffmpeg.exec(["-i", input, "-vn", "-map", "0:a:0", "-codec:a", "libmp3lame", "-q:a", "2", "-id3v2_version", "3", output]);
      if (result !== 0) throw new Error("Could not convert this video. Check that it contains an audio track.");
      const data = await ffmpeg.readFile(output);
      if (typeof data === "string" || !data.length) throw new Error("The MP3 output was empty.");
      const mp3Bytes = new Uint8Array(data);
      const blobUrl = URL.createObjectURL(new Blob([mp3Bytes.buffer as ArrayBuffer], { type: "audio/mpeg" }));
      setConverted(blobUrl); setConvertedName(video.name.replace(/\.[^.]+$/, "") + ".mp3"); setConvertProgress(100); notify("Your MP3 is ready.");
      await ffmpeg.terminate();
    } catch (error) { setConvertError(error instanceof Error ? error.message : "Conversion failed. Please try again."); }
    finally { setConverting(false); }
  }
  async function importFiles(files: FileList | File[]) {
    if (!db) return;
    let count = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|flac|ogg|aac|opus)$/i.test(file.name)) continue;
      if (tracks.some(t => t.filename === file.name && t.size === file.size)) continue;
      const duration = await new Promise<number>(resolve => { const objectUrl = URL.createObjectURL(file); const audio = new Audio(); audio.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve(audio.duration || 0); }; audio.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(0); }; audio.src = objectUrl; });
      const track: Track = { id: id(), name: file.name.replace(/\.[^.]+$/, ""), filename: file.name, size: file.size, duration, addedAt: Date.now(), file };
      await dbRequest(db, "files", "readwrite", s => s.put(track)); count++;
    }
    setTracks(await dbRequest<Track[]>(db, "files", "readonly", s => s.getAll())); notify(count ? count + " track(s) added to your library." : "No new supported audio files found.");
  }
  async function createPlaylist() {
    if (!db || !playlistName.trim()) return;
    const playlist = { id: id(), name: playlistName.trim().slice(0, 50), ids: [] as string[] };
    await dbRequest(db, "playlists", "readwrite", s => s.put(playlist)); setPlaylists(old => [...old, playlist]); setPlaylistName(""); setShowNewPlaylist(false); notify("Playlist created.");
  }
  async function deleteTrack(trackId: string) {
    if (!db) return; await dbRequest(db, "files", "readwrite", s => s.delete(trackId));
    const nextTracks = tracks.filter(t => t.id !== trackId); setTracks(nextTracks);
    const nextLists = playlists.map(p => ({ ...p, ids: p.ids.filter(x => x !== trackId) })); setPlaylists(nextLists);
    for (const p of nextLists) await dbRequest(db, "playlists", "readwrite", s => s.put(p));
    if (activeTrack?.id === trackId) { audioRef.current?.pause(); setActiveTrack(null); }
  }
  async function deletePlaylist(playlistId: string) {
    if (!db) return; await dbRequest(db, "playlists", "readwrite", s => s.delete(playlistId)); setPlaylists(old => old.filter(p => p.id !== playlistId)); if (selectedPlaylist === playlistId) setSelectedPlaylist(null);
  }
  async function togglePlaylist(trackId: string, playlistId: string) {
    if (!db) return;
    const list = playlists.find(p => p.id === playlistId); if (!list) return;
    const next = { ...list, ids: list.ids.includes(trackId) ? list.ids.filter(x => x !== trackId) : [...list.ids, trackId] };
    await dbRequest(db, "playlists", "readwrite", s => s.put(next)); setPlaylists(old => old.map(p => p.id === playlistId ? next : p));
  }
  function playTrack(track: Track, list = playlistTracks) {
    const audio = audioRef.current; if (!audio) return;
    setQueue(list.map(t => t.id)); setActiveTrack(track);
    audio.src = URL.createObjectURL(track.file); audio.play().then(() => setPlaying(true)).catch(() => notify("This audio format could not be played."));
  }
  function skipTrack(direction: number) {
    const audio = audioRef.current; if (!audio || !queue.length) return;
    const currentIndex = queue.indexOf(activeTrack?.id || "");
    const nextId = queue[(currentIndex + direction + queue.length) % queue.length];
    const nextTrack = tracks.find(t => t.id === nextId); if (nextTrack) playTrack(nextTrack, tracks.filter(t => queue.includes(t.id)));
  }

  const tabs = [{ id: "links" as const, label: "Link downloader", sub: "Pull media from the web", icon: Link2 }, { id: "extract" as const, label: "Audio extractor", sub: "Turn video into MP3", icon: AudioLines }, { id: "library" as const, label: "Your library", sub: "Play it your way", icon: ListMusic }];
  const options = [...(media?.videos || []).map(v => ({ ...v, kind: "Video" })), ...(media?.audios || []).map(v => ({ ...v, kind: "Audio" })), ...(media?.images || []).map(v => ({ ...v, kind: "Image" }))];

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><Disc3 size={21}/></span><span>spool<span className="brand-dot">.</span></span></a>
      <nav><a href="#studio">Studio</a><a href="#library" onClick={() => setTab("library")}>Library</a><a href="#about">About</a></nav>
      <button className="icon-button theme-toggle" onClick={() => setLight(v => !v)} aria-label="Toggle color theme">{light ? <Moon size={17}/> : <Sun size={17}/>}</button>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse-dot"/> YOUR PERSONAL MEDIA STUDIO</div>
          <h1>Make room<br/>for <span>your sound.</span></h1>
          <p>Bring your media together. Save public links, extract audio from video, and build a music library that stays yours.</p>
          <div className="hero-actions"><a className="primary-button" href="#studio">Open the studio <ArrowRight size={16}/></a><span className="privacy-note"><ShieldCheck size={15}/> Private by design</span></div>
          <div className="hero-proof"><span><i/> On-device audio conversion</span><span><i/> Your own music library</span></div>
        </div>
        <div className="hero-art" aria-label="Abstract spinning vinyl record">
          <div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/>
          <motion.div className="vinyl" animate={{ rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }}>
            <div className="vinyl-grooves"/><div className="vinyl-label"><span>spool</span><small>MEDIA STUDIO · VOL. 01</small></div>
          </motion.div>
          <div className="floating-card float-top"><span className="float-icon"><Download size={15}/></span><span><b>Link to library</b><small>One simple workflow</small></span><Check size={15}/></div>
          <div className="floating-card float-bottom"><span className="float-icon"><AudioLines size={16}/></span><span><b>Audio, extracted</b><small>Ready when you are</small></span><Zap size={15}/></div>
          <div className="art-caption">YOUR MEDIA. YOUR RULES.</div>
        </div>
      </section>

      <section className="studio-section" id="studio">
        <div className="section-heading"><div><div className="eyebrow">THE WORKSPACE</div><h2>One studio.<br/><span>Three ways to create.</span></h2></div><p>Everything you need, exactly where you need it. Pick a workspace and get into it.</p></div>
        <div className="workspace-grid">
          <aside className="workspace-nav">
            <div className="nav-label">WORKSPACES</div>
            {tabs.map((item, index) => { const Icon = item.icon; return <button key={item.id} className={"workspace-tab " + (tab === item.id ? "selected" : "")} onClick={() => setTab(item.id)}><span className="workspace-icon"><Icon size={18}/></span><span className="workspace-copy"><b>{item.label}</b><small>{item.sub}</small></span><span className="tab-number">0{index + 1}</span></button>; })}
            <div className="sidebar-bottom"><ShieldCheck size={16}/><span><b>Your files stay yours.</b><small>Music is stored locally on this device.</small></span></div>
          </aside>
          <section className="workspace-panel">
            <AnimatePresence mode="wait">
              {tab === "links" && <motion.div key="links" className="panel-content" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: .2 }}>
                <div className="panel-title"><div className="panel-title-icon"><Link2 size={19}/></div><div><div className="eyebrow">01 / LINK DOWNLOADER</div><h3>Bring a link. Take the media.</h3><p>Paste a public post URL and Spool will find the available media.</p></div></div>
                <form className="link-form" onSubmit={submitLink}><label htmlFor="media-url">PASTE YOUR MEDIA LINK</label><div className="url-control"><Link2 size={17}/><input id="media-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.tiktok.com/… or instagram.com/…" type="url" required/><button disabled={linkLoading}>{linkLoading ? <><LoaderCircle className="spin" size={16}/> Finding</> : <>Continue <ArrowRight size={16}/></>}</button></div></form>
                <div className="supported-row"><span>WORKS WITH</span><b className="platform-pill">TikTok</b><b className="platform-pill">Instagram</b><b className="platform-pill">X / Twitter</b><span className="supported-caption">Public posts only</span></div>
                {linkLoading && <div className="status-card"><LoaderCircle className="spin" size={20}/><span><b>Reading the post</b><small>Connecting to {mediaPlatform}. First requests can take a little longer.</small></span></div>}
                {linkError && <div className="error-card"><CircleHelp size={18}/><span><b>Couldn’t retrieve this post</b><small>{linkError}</small></span></div>}
                {media && <div className="media-result">
                  <div className="result-header">{media.thumbnail ? <img src={media.thumbnail} alt="Post thumbnail"/> : <div className="result-placeholder"><FileVideo size={24}/></div>}<div><span className="eyebrow">{mediaPlatform.toUpperCase()} · PUBLIC POST</span><b>{media.title || "Your media is ready"}</b><small>{media.duration ? "Duration " + formatTime(media.duration) : options.length + " download options"}</small></div></div>
                  <div className="download-options">{options.map((option, i) => <button key={option.url + i} className="download-option" onClick={() => downloadFile(option.url, "spool-" + mediaPlatform.toLowerCase() + "-" + option.kind.toLowerCase() + (option.kind === "Audio" ? ".m4a" : option.kind === "Image" ? ".jpg" : ".mp4"))}><span className="option-icon">{option.kind === "Audio" ? <FileAudio size={17}/> : option.kind === "Image" ? <FolderOpen size={17}/> : <Video size={17}/>}</span><span><b>{option.kind}</b><small>{option.quality || "Best available"}</small></span><span className="download-label">Download <ArrowDownToLine size={15}/></span></button>)}</div>
                  <small className="rights-note">Only download content you own or have permission to save.</small>
                </div>}
                <div className="panel-footnote"><ShieldCheck size={15}/><span>Spool uses a free, open-source service. Private, login-restricted and DRM-protected content is not supported.</span></div>
              </motion.div>}
              {tab === "extract" && <motion.div key="extract" className="panel-content" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: .2 }}>
                <div className="panel-title"><div className="panel-title-icon"><AudioLines size={19}/></div><div><div className="eyebrow">02 / AUDIO EXTRACTOR</div><h3>Keep the sound. Lose the video.</h3><p>Turn a video file into a high-quality MP3, right on your device.</p></div></div>
                {!video ? <button className="dropzone" onClick={() => videoInputRef.current?.click()}><span className="dropzone-icon"><Upload size={21}/></span><b>Drop a video into your workflow</b><small>MP4, MOV, WebM and more · Up to 250 MB</small><span className="browse-button">Browse files <ArrowRight size={14}/></span></button> : <div className="selected-video"><div className="video-file"><span className="video-file-icon"><FileVideo size={20}/></span><span><b>{video.name}</b><small>{formatSize(video.size)} · Ready to extract</small></span><button className="icon-button" onClick={() => { setVideo(null); setConverted(null); setConvertError(""); }} aria-label="Remove video"><X size={17}/></button></div><video src={videoPreview} controls playsInline/><button className="primary-button convert-button" onClick={convertVideo} disabled={converting}>{converting ? <><LoaderCircle className="spin" size={16}/> Converting {convertProgress}%</> : <><AudioLines size={17}/> Convert to MP3 <ArrowRight size={16}/></>}</button>{converting && <div className="conversion-progress"><span style={{ width: convertProgress + "%" }}/></div>}{convertError && <div className="error-card"><CircleHelp size={18}/><span><b>Conversion failed</b><small>{convertError}</small></span></div>}{converted && <a className="ready-download" href={converted} download={convertedName}><Download size={17}/> Download {convertedName}</a>}</div>}
                <input ref={videoInputRef} hidden type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv" onChange={e => { const file = e.target.files?.[0]; if (file) { setVideo(file); setConverted(null); setConvertError(""); } e.currentTarget.value = ""; }}/>
                <div className="panel-footnote"><ShieldCheck size={15}/><span>Conversion runs locally in your browser using FFmpeg. Your video is not uploaded to Spool.</span></div>
              </motion.div>}
              {tab === "library" && <motion.div key="library" id="library" className="panel-content" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: .2 }}>
                <div className="panel-title"><div className="panel-title-icon"><ListMusic size={19}/></div><div><div className="eyebrow">03 / PERSONAL LIBRARY</div><h3>Your music. Your collection.</h3><p>A private music space stored in this browser on this device.</p></div></div>
                <div className="library-overview"><div><b>{tracks.length.toString().padStart(2, "0")}</b><small>TRACKS</small></div><div><b>{playlists.length.toString().padStart(2, "0")}</b><small>PLAYLISTS</small></div><div><b>{formatSize(tracks.reduce((sum, t) => sum + t.size, 0))}</b><small>LOCAL STORAGE</small></div></div>
                <div className="library-toolbar"><div className="search-field"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find something to play…"/></div><button className="secondary-button" onClick={() => audioInputRef.current?.click()}><Plus size={16}/> Import music</button><input ref={audioInputRef} hidden type="file" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac" multiple onChange={e => { if (e.target.files) void importFiles(e.target.files); e.currentTarget.value = ""; }}/></div>
                <div className="playlist-filter"><button className={!selectedPlaylist ? "active" : ""} onClick={() => setSelectedPlaylist(null)}>All tracks</button>{playlists.map(p => <button key={p.id} className={selectedPlaylist === p.id ? "active" : ""} onClick={() => setSelectedPlaylist(p.id)}>{p.name}</button>)}<button className="add-playlist" onClick={() => setShowNewPlaylist(v => !v)}><Plus size={13}/> New playlist</button></div>
                {showNewPlaylist && <form className="new-playlist-form" onSubmit={e => { e.preventDefault(); void createPlaylist(); }}><input autoFocus value={playlistName} onChange={e => setPlaylistName(e.target.value)} placeholder="Give your playlist a name" maxLength={50}/><button type="submit" disabled={!playlistName.trim()}>Create</button></form>}
                <div className="track-list">{visibleTracks.length ? visibleTracks.map((track, index) => <div className={"track-row " + (activeTrack?.id === track.id ? "is-playing" : "")} key={track.id}><span className="track-index">{activeTrack?.id === track.id && playing ? <AudioLines size={15}/> : String(index + 1).padStart(2, "0")}</span><button className="track-play" onClick={() => activeTrack?.id === track.id ? (audioRef.current?.paused ? audioRef.current.play() : audioRef.current.pause()) : playTrack(track)}>{activeTrack?.id === track.id && playing ? <Pause size={15}/> : <Play size={15}/>}</button><span className="track-name"><b>{track.name}</b><small>{track.filename}</small></span><span className="track-duration">{formatTime(track.duration)}</span><div className="track-actions"><select aria-label={"Add " + track.name + " to playlist"} value="" onChange={e => { if (e.target.value) void togglePlaylist(track.id, e.target.value); }}><option value="">＋</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button onClick={() => void deleteTrack(track.id)} aria-label="Remove track"><Trash2 size={15}/></button></div></div>) : <div className="empty-library"><span className="empty-icon"><Headphones size={25}/></span><b>{selectedPlaylist ? "This playlist is waiting for music." : "Your library starts here."}</b><small>Import audio files from your phone to build your collection.</small><button className="secondary-button" onClick={() => audioInputRef.current?.click()}><Plus size={15}/> Add your first track</button></div>}</div>
                {playlists.length > 0 && <div className="playlist-manage"><span><b>Your playlists</b><small>Organize your sound, your way.</small></span>{playlists.map(p => <button key={p.id} onClick={() => void deletePlaylist(p.id)} title={"Delete " + p.name}><span>{p.name} <small>{p.ids.length} tracks</small></span><X size={14}/></button>)}</div>}
              </motion.div>}
            </AnimatePresence>
          </section>
        </div>
      </section>

      <section className="closing-banner" id="about"><div className="closing-symbol"><Disc3 size={31}/></div><div><div className="eyebrow">A LITTLE MORE YOU</div><h2>Good media. <span>Good energy.</span></h2><p>Keep your tools close, your music organized, and your files in your hands.</p></div><a href="#studio" onClick={() => setTab("links")}>Back to studio <ArrowRight size={16}/></a></section>
    </main>
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><Disc3 size={18}/></span><span>spool<span className="brand-dot">.</span></span></a><span>Personal media tools, thoughtfully made.</span><small>Respect creators. Only save media you have permission to use.</small></footer>
    <audio ref={audioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration * 100 : 0)} onEnded={() => skipTrack(1)}/>
    <AnimatePresence>{activeTrack && <motion.div className="now-playing" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}><div className="now-art"><Music2 size={19}/></div><div className="now-meta"><b>{activeTrack.name}</b><small>{activeTrack.filename}</small></div><button onClick={() => skipTrack(-1)} aria-label="Previous track">‹‹</button><button className="now-play" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause(); }} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button><button onClick={() => skipTrack(1)} aria-label="Next track">››</button><button onClick={() => { audioRef.current?.pause(); setActiveTrack(null); }} aria-label="Close player"><X size={16}/></button><div className="now-progress"><span style={{ width: progress + "%" }}/></div></motion.div>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>
  </div>;
}