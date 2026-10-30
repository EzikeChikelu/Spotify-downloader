const CLIENT_KEY = "spool-spotify-client-id";
const REDIRECT_KEY = "spool-spotify-redirect";
const TOKEN_KEY = "spool-spotify-token";
const $ = (id) => document.getElementById(id);
const state = { token: null, playlists: [], selected: null, tracks: [], audio: [], view: "playlists" };
const toast = (message) => { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); };
const escapeHTML = (value="") => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const spotifyId = (value) => { const match=String(value).match(/(?:playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/); return match?match[1]:null; };
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function randomString(length=64){const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";const bytes=crypto.getRandomValues(new Uint8Array(length));return Array.from(bytes,b=>chars[b%chars.length]).join("");}
async function sha256(text){return await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));}
function getClientId(){return localStorage.getItem(CLIENT_KEY)||"";}
function getRedirect(){return location.origin+location.pathname;}
async function connectSpotify(){
 let clientId=getClientId();
 if(!clientId){clientId=prompt("Enter your Spotify Developer app Client ID (not your password):");if(!clientId)return;localStorage.setItem(CLIENT_KEY,clientId.trim());}
 const redirect=getRedirect();
 if(!localStorage.getItem(REDIRECT_KEY))localStorage.setItem(REDIRECT_KEY,redirect);
 const verifier=randomString(64);sessionStorage.setItem("spool_verifier",verifier);
 const challenge=base64url(new Uint8Array(await sha256(verifier)));
 const oauthState=randomString(32);sessionStorage.setItem("spool_oauth_state",oauthState);
 const params=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirect,code_challenge_method:"S256",code_challenge:challenge,state:oauthState,scope:"playlist-read-private playlist-read-collaborative"});
 location.href="https://accounts.spotify.com/authorize?"+params.toString();
}
async function spotify(path,options={}){
 const response=await fetch("https://api.spotify.com/v1"+path,{...options,headers:{Authorization:"Bearer "+state.token,"Content-Type":"application/json",...(options.headers||{})}});
 if(response.status===401){state.token=null;sessionStorage.removeItem(TOKEN_KEY);throw new Error("Spotify session expired. Please connect again.");}
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error?.message||"Spotify request failed ("+response.status+")");}
 return response.json();
}
async function handleCallback(){
 const params=new URLSearchParams(location.search),code=params.get("code"),error=params.get("error"),returnedState=params.get("state"),expectedState=sessionStorage.getItem("spool_oauth_state");
 if(error){sessionStorage.removeItem("spool_oauth_state");history.replaceState({}, "", location.pathname);toast("Spotify sign-in was cancelled.");return;}
 if(!code)return;
 if(!returnedState||returnedState!==expectedState){history.replaceState({}, "", location.pathname);sessionStorage.removeItem("spool_oauth_state");toast("Sign-in verification failed. Please connect again.");return;}
 sessionStorage.removeItem("spool_oauth_state");
 const verifier=sessionStorage.getItem("spool_verifier"),clientId=getClientId();
 try{
  const response=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,grant_type:"authorization_code",code,redirect_uri:getRedirect(),code_verifier:verifier})});
  const data=await response.json();if(!response.ok)throw new Error(data.error_description||"Could not complete Spotify sign-in.");
  state.token=data.access_token;sessionStorage.setItem(TOKEN_KEY,state.token);history.replaceState({}, "", location.pathname);await loadPlaylists();
 }catch(err){history.replaceState({}, "", location.pathname);toast(err.message);}
}
async function loadPlaylists(){
 try{ $("connectState").classList.add("hidden");$("playlistView").classList.remove("hidden");$("panelSubtitle").textContent="Loading your Spotify library…";
  let url="/me/playlists?limit=50";state.playlists=[];
  while(url){const data=await spotify(url.replace("https://api.spotify.com/v1",""));state.playlists.push(...data.items);url=data.next;}
  renderPlaylists();$("panelSubtitle").textContent=state.playlists.length+" playlists in your library";$("playlistCount").textContent=state.playlists.length;toast("Your playlists are ready.");
 }catch(err){$("panelSubtitle").textContent="Unable to load playlists";toast(err.message);}
}
function renderPlaylists(){
 $("playlistGrid").innerHTML=state.playlists.map(p=>{const img=p.images?.[0]?.url;return `<button class="playlist-card" data-playlist="${escapeHTML(p.id)}">${img?`<img src="${escapeHTML(img)}" alt="">`:'<div class="playlist-placeholder">♫</div>'}<b>${escapeHTML(p.name)}</b><small>${p.items?.total??p.tracks?.total??0} tracks</small></button>`;}).join("")||"<p>No playlists found on this account.</p>";
 document.querySelectorAll("[data-playlist]").forEach(btn=>btn.addEventListener("click",()=>selectPlaylist(btn.dataset.playlist)));
}
async function selectPlaylist(id){
 const p=state.playlists.find(x=>x.id===id);if(!p)return;state.selected=p;state.tracks=[];$("trackArea").classList.remove("hidden");$("selectedPlaylist").textContent=p.name;$("trackMeta").textContent="Loading tracks…";$("trackList").innerHTML="";
 try{let url=`/playlists/${encodeURIComponent(id)}/items?limit=50&fields=items(item(name,artists(name),album(name,images),duration_ms,external_urls,type,is_local)),next,total`;
  while(url){const data=await spotify(url);state.tracks.push(...data.items.map(x=>x.item??x.track).filter(Boolean));url=data.next?data.next.replace("https://api.spotify.com/v1",""):null;}
  $("trackMeta").textContent=state.tracks.length+" tracks · Playlist details only";$("trackList").innerHTML=state.tracks.map((t,i)=>`<div class="track-row"><span class="num">${String(i+1).padStart(2,"0")}</span><div><b>${escapeHTML(t.name)}</b><small>${escapeHTML(t.artists?.map(a=>a.name).join(", ")||"Unknown artist")} · <a href="${escapeHTML(t.external_urls?.spotify||"https://open.spotify.com/")}" target="_blank" rel="noopener noreferrer">Listen on Spotify ↗</a></small></div><time>${formatTime(t.duration_ms)}</time></div>`).join("");
  $("trackArea").scrollIntoView({behavior:"smooth",block:"nearest"});
 }catch(err){const message=String(err.message||"");const friendly=/403|forbidden|insufficient/i.test(message)?"Spotify only exposes the full item list for playlists you own or collaborate on. Try one of your own playlists.":message;$("trackMeta").textContent=friendly;toast(friendly);}
}
function formatTime(ms=0){const s=Math.floor(ms/1000);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function safeName(name){return String(name||"playlist").replace(/[\\/:*?"<>|]/g,"-").slice(0,90);}
function exportCSV(){const rows=[["Track","Artist","Album","Duration","Spotify URL"],...state.tracks.map(t=>[t.name,t.artists?.map(a=>a.name).join(", "),t.album?.name,formatTime(t.duration_ms),t.external_urls?.spotify||""])];downloadBlob("\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),safeName(state.selected?.name)+".csv","text/csv;charset=utf-8");}
function exportJSON(){downloadBlob(JSON.stringify({playlist:state.selected?.name,exportedAt:new Date().toISOString(),tracks:state.tracks.map(t=>({title:t.name,artists:t.artists?.map(a=>a.name),album:t.album?.name,durationMs:t.duration_ms,url:t.external_urls?.spotify}))},null,2),safeName(state.selected?.name)+".json","application/json");}
function exportM3U(){const lines=["#EXTM3U",...state.tracks.flatMap(t=>["#EXTINF:"+Math.floor((t.duration_ms||0)/1000)+","+(t.artists?.map(a=>a.name).join(", ")||"")+" - "+t.name,t.external_urls?.spotify||""])];downloadBlob(lines.join("\n"),safeName(state.selected?.name)+".m3u","audio/x-mpegurl");}
function switchView(view){state.view=view;document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));$("playlistView").classList.toggle("hidden",view!=="playlists");$("connectState").classList.toggle("hidden",view!=="playlists"||!!state.token);$("audioView").classList.toggle("hidden",view!=="audio");$("panelTitle").textContent=view==="playlists"?"Spotify playlists":"My audio files";$("panelSubtitle").textContent=view==="playlists"?(state.token?"Your connected library":"Connect your account to get started"):"Audio saved on this device";if(view==="audio")renderAudio();}
function addAudio(files){for(const file of files){if(!file.type.startsWith("audio/"))continue;state.audio.push({file,id:crypto.randomUUID()});} $("audioCount").textContent=state.audio.length;renderAudio();if(files.length)toast("Audio added to your local library.");}
function renderAudio(){$("audioList").innerHTML=state.audio.map(item=>`<div class="audio-item"><span class="audio-icon">♫</span><div class="audio-info"><b>${escapeHTML(item.file.name)}</b><small>${(item.file.size/1048576).toFixed(1)} MB · On this device</small></div><button class="download-btn" data-download="${item.id}">↓ Save</button></div>`).join("")||"";document.querySelectorAll("[data-download]").forEach(btn=>btn.addEventListener("click",()=>{const item=state.audio.find(x=>x.id===btn.dataset.download);if(item){const url=URL.createObjectURL(item.file),a=document.createElement("a");a.href=url;a.download=item.file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}}));}
$("connectTop").addEventListener("click",connectSpotify);$("connectHero").addEventListener("click",connectSpotify);$("connectPanel").addEventListener("click",connectSpotify);
$("refreshBtn").addEventListener("click",()=>state.token?loadPlaylists():connectSpotify());
$("themeToggle").addEventListener("click",()=>{document.body.classList.toggle("light");localStorage.setItem("spool-theme",document.body.classList.contains("light")?"light":"dark");});
document.querySelectorAll(".side-link").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("csvBtn").addEventListener("click",exportCSV);$("jsonBtn").addEventListener("click",exportJSON);$("m3uBtn").addEventListener("click",exportM3U);
$("audioInput").addEventListener("change",e=>addAudio([...e.target.files]));
const drop=$("dropZone");["dragenter","dragover"].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.style.borderColor="var(--green)";}));["dragleave","drop"].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.style.borderColor="";if(evt==="drop")addAudio([...e.dataTransfer.files]);}));
if(localStorage.getItem("spool-theme")==="light")document.body.classList.add("light");
(async()=>{const saved=sessionStorage.getItem(TOKEN_KEY);if(saved){state.token=saved;await loadPlaylists();}await handleCallback();})();
