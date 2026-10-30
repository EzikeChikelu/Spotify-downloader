const ALLOWED_HOSTS = [
  "tiktok.com",
  "instagram.com",
  "x.com",
  "twitter.com"
];

function isAllowedPostUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some(domain => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const token = process.env.EASYDOWN_API_TOKEN;
  if (!token) {
    return { statusCode: 503, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "EASYDOWN_API_TOKEN is not configured on the server." }) };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Invalid request body." }) };
  }

  if (typeof input.url !== "string" || input.url.length > 2048 || !isAllowedPostUrl(input.url)) {
    return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Paste a valid public TikTok, Instagram, or X post URL." }) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await fetch("https://api.easydown.org/api/v1/parse", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url: input.url }),
      signal: controller.signal
    });

    const bodyText = await upstream.text();
    let data;
    try { data = JSON.parse(bodyText); }
    catch { data = { msg: "The media service returned an unreadable response." }; }

    if (!upstream.ok) {
      const message = data?.msg || data?.message || data?.error || "The media service could not process this post.";
      return {
        statusCode: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ error: String(message).slice(0, 500) })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify(data)
    };
  } catch (error) {
    const message = error.name === "AbortError"
      ? "The media service timed out. Please try again."
      : "Could not connect to the media service. Please try again.";
    return { statusCode: 502, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify({ error: message }) };
  } finally {
    clearTimeout(timeout);
  }
};
