const ALLOWED_HOSTS = ["tiktok.com", "instagram.com", "x.com", "twitter.com"];
function isAllowedPostUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some(domain => host === domain || host.endsWith("." + domain));
  } catch { return false; }
}
exports.handler = async function (event) {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed." }) };
  const base = (process.env.YTDLP_API_URL || "").replace(/\/$/, "");
  if (!base) return { statusCode: 503, headers, body: JSON.stringify({ error: "YTDLP_API_URL is not configured on Netlify." }) };
  let input;
  try { input = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body." }) }; }
  if (typeof input.url !== "string" || input.url.length > 2048 || !isAllowedPostUrl(input.url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Paste a valid public TikTok, Instagram, or X post URL." }) };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const upstream = await fetch(base + "/info?url=" + encodeURIComponent(input.url), { headers: { "Accept": "application/json" }, signal: controller.signal });
    const raw = await upstream.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { error: "The free downloader returned an invalid response." }; }
    if (!upstream.ok) return { statusCode: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, headers, body: JSON.stringify({ error: data.detail || data.error || "Could not process this post." }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (error) {
    const message = error.name === "AbortError" ? "The free downloader took too long. Try again." : "Could not reach the free downloader. It may be waking from sleep; try again shortly.";
    return { statusCode: 502, headers, body: JSON.stringify({ error: message }) };
  } finally { clearTimeout(timeout); }
};
