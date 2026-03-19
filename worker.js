/**
 * DSR Dashboard — Cloudflare Worker (Backend Proxy)
 * ─────────────────────────────────────────────────
 * This worker authenticates with Google Drive using a Service Account
 * and proxies all Drive API calls. Frontend users need ZERO sign-in.
 *
 * Deploy this to Cloudflare Workers (free tier is enough).
 * Set these environment variables / secrets in Cloudflare dashboard:
 *
 *   SERVICE_ACCOUNT_EMAIL   → from your service account JSON
 *   SERVICE_ACCOUNT_KEY     → private_key from service account JSON (full PEM string)
 *   ALLOWED_ORIGIN          → your GitHub Pages URL e.g. https://yourname.github.io
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DSR_FOLDER_NAME = "DSR Reports";

// ── Cache folder ID in memory (survives Worker warm state) ──
let cachedFolderId = null;
let cachedToken = null;
let tokenExpiry = 0;

// ════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";

    // CORS headers
    const cors = {
      "Access-Control-Allow-Origin": allowed || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const token = await getAccessToken(env);

      // ── Routes ──────────────────────────────────
      if (path === "/api/list" && request.method === "GET") {
        return jsonResp(await listFiles(token, env), cors);
      }

      if (path === "/api/save" && request.method === "POST") {
        const body = await request.json();
        return jsonResp(await saveFile(token, body, env), cors);
      }

      if (path === "/api/load" && request.method === "GET") {
        const fileId = url.searchParams.get("id");
        if (!fileId) return jsonResp({ error: "Missing id" }, cors, 400);
        return jsonResp(await loadFile(token, fileId), cors);
      }

      if (path === "/api/delete" && request.method === "POST") {
        const { id } = await request.json();
        if (!id) return jsonResp({ error: "Missing id" }, cors, 400);
        await deleteFile(token, id);
        return jsonResp({ ok: true }, cors);
      }

      if (path === "/api/health") {
        return jsonResp({ status: "ok", folder: cachedFolderId }, cors);
      }

      return jsonResp({ error: "Not found" }, cors, 404);

    } catch (err) {
      console.error(err);
      return jsonResp({ error: err.message }, cors, 500);
    }
  }
};

// ════════════════════════════════════════════════════
// GOOGLE SERVICE ACCOUNT — JWT → Access Token
// ════════════════════════════════════════════════════
async function getAccessToken(env) {
  if (cachedToken && Date.now() < tokenExpiry - 30000) return cachedToken;

  const email = env.SERVICE_ACCOUNT_EMAIL;
  const rawKey = env.SERVICE_ACCOUNT_KEY;

  if (!email || !rawKey) throw new Error("SERVICE_ACCOUNT_EMAIL or SERVICE_ACCOUNT_KEY not set");

  // Build JWT
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim  = b64url(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now
  }));

  const sigInput = `${header}.${claim}`;
  const signature = await rsaSign(sigInput, rawKey);
  const jwt = `${sigInput}.${signature}`;

  // Exchange JWT for access token
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await r.json();
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// ════════════════════════════════════════════════════
// DRIVE OPERATIONS
// ════════════════════════════════════════════════════
async function ensureFolder(token) {
  if (cachedFolderId) return cachedFolderId;

  // Search
  const q = encodeURIComponent(`name='${DSR_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r  = await driveGet(`${DRIVE_API}/files?q=${q}&fields=files(id)`, token);
  if (r.files?.length) { cachedFolderId = r.files[0].id; return cachedFolderId; }

  // Create
  const cr = await driveFetch(`${DRIVE_API}/files`, token, "POST",
    { name: DSR_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }
  );
  cachedFolderId = cr.id;
  return cachedFolderId;
}

async function listFiles(token, env) {
  const folderId = await ensureFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/json' and trashed=false`);
  return driveGet(`${DRIVE_API}/files?q=${q}&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,size)&pageSize=100`, token);
}

async function saveFile(token, body, env) {
  const folderId = await ensureFolder(token);
  const { fileName, data } = body;
  if (!fileName || !data) throw new Error("Missing fileName or data");

  const jsonStr  = JSON.stringify(data);
  const metadata = { name: fileName, mimeType: "application/json", parents: [folderId] };
  const boundary = "dsr_boundary_xyz987";

  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonStr}\r\n`,
    `--${boundary}--`
  ].join("");

  const r = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`
    },
    body: multipart
  });
  return r.json();
}

async function loadFile(token, fileId) {
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Drive read error ${r.status}`);
  return r.json();
}

async function deleteFile(token, fileId) {
  await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// ════════════════════════════════════════════════════
// LOW-LEVEL HELPERS
// ════════════════════════════════════════════════════
async function driveGet(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function driveFetch(url, token, method, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function rsaSign(input, pemKey) {
  // Clean PEM
  const pem = pemKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const encoded = new TextEncoder().encode(input);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function jsonResp(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
