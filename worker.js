/**
 * DSR Dashboard — Cloudflare Worker (Backend Proxy)
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DSR_FOLDER_NAME = "DSR Reports";

let cachedFolderId = null;
let cachedToken = null;
let tokenExpiry = 0;

export default {
  async fetch(request) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const token = await getAccessToken();

      if (path === "/api/list" && request.method === "GET") {
        return jsonResp(await listFiles(token), cors);
      }

      if (path === "/api/save" && request.method === "POST") {
        const body = await request.json();
        return jsonResp(await saveFile(token, body), cors);
      }

      if (path === "/api/load" && request.method === "GET") {
        const fileId = url.searchParams.get("id");
        return jsonResp(await loadFile(token, fileId), cors);
      }

      if (path === "/api/delete" && request.method === "POST") {
        const { id } = await request.json();
        await deleteFile(token, id);
        return jsonResp({ ok: true }, cors);
      }

      if (path === "/api/health") {
        return jsonResp({ status: "ok", folder: cachedFolderId }, cors);
      }

      return jsonResp({ error: "Not found" }, cors, 404);

    } catch (err) {
      return jsonResp({ error: err.message }, cors, 500);
    }
  }
};

// ───────── TOKEN ─────────
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 30000) return cachedToken;

  const email = "dsr-bot@wise-resolver-490713-j6.iam.gserviceaccount.com";

  const rawKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC9hVHMK8qsPvpJ
s6wg2txk+Uy7uNh42lgLCsgCTI5aTEkDLc7fyj8rfPqcVhLa/CtCKfQnh3tSBcA2
uIZczLCZrG2CHHIU05xVThFRre4k6pzyLmoYbTwBsBwHwocNqmFiem7GzVQIXZ90
wLb2lnYWb3o9Wx7hiAJX257zLfC2HzaowwDnJS3h1VByP5d87KgtbxiS+9QsKgR7
k5Bwip8mCnVN60LSVyoBf+QtQHCBZRqb0EqHrGUCGVHjkmdj80AeseTekpEplUsh
gmpoW+jH1vc4OQsJrwnJokF3eYlea8bMW2ZxnHt4udZQoeb1rBGv8UmZ5nvJci9q
UxxJ0YrHAgMBAAECggEAGA6XToJ0jJ7F6JsdC2KcvViD7ARPvi+BI42vy9Lp8v5h
+jxTWUbz89I+gZ/Pbuq5lwF6U5Y4CjZeqtOLgrYc6LThhbWUqZ4e5xksy6B3bUo2
t+s6XnVnO5OeS0HfINXy3KxL6YJg21r/BbP8xZpdzQVDkAxEBD7ehUaEi7vWJVfi
9cD0TX1VgQzWlobDjJEvWrOv+Fm6Ua8i7Ds667ks/JEq/xz0osH5Ar5wbcLE5QwZ
jPqw5oZCsG5E1YTUkE0jp0qo8VNRSDtV6x/9jHbAXFo8ZaT+5ObFkxMHISEHmRAs
KzLLddCBwLpLthT4u2PCGz9c/VatN6eQ1P2Yx+MnMQKBgQDpYzEmV62s2t0OlwMx
SJcV+QwNtZFUGjk7Pq3XOo5NdW/9Itmd3uSZy+DFa7/5G7yp7WWc7mlWYuLh4dV4
1CHwQi3XiDQzhPUCHFY5lKVIwodEpUwb+IwISazKk3yXignI7HhPF8VYsA7mkDeq
pWFLghMEN3J3nx9Cv1Sji7V73wKBgQDP4hVgIc2jPCKFBcDX9jY/Jug0/evpHb5M
wAQfWQCTHvsr3517+GIbX5T9k5UgKVfbtQaEFFFkBrvsHtwKcCFyMNLyWZd+D5Lk
9pbMVuOe2SJA7uTLENbb5moGqCkcuWbogbkYv2w+eOcdaDLhfdoJoh0p4fyJ5PAJ
PSb50fXOGQKBgDxmmHTE4kTHC8jX2lKp57gfETiHEgqDEua7TQBTvjpbt1T67PkH
k4AeHJjbTv6oaAZOUyrvJMHfq7or2TSBKhtk9To/nMrskQAv1zzltHUFKz7fzLe8
dnk6oAZ5bxhE+E1Qrb5Cd6eBQQn4rv9x96E0E7nWo8BDpTKAE+aTpK9fAoGBAKJs
DbF3l9jzUjFG5n6WE5pSBtnoj1srbxU+bbokawuICE0mQUCsN9MVYi6iEcD4LHow
PXATA+i4TjnVfqz1IVy8AwVxtKi8+FPGytnLBbuGAXpkbQSwGn/jznF3D/Aud9Yw
DPPmFGfXRRQ35pFCKIqgTFL+C7ed1WISkpJcVsZ5AoGBAJmuklzwKQQRBsEak8ig
vrAQop2zhrUcsjBbFkTUoj3W8VxUj62yLHKeumJz7K7WPaeFt6n4gCELfwrS8mWi
zNlGYFo517dxj7xdPI0BUPsKjWydbek0fWhYCNQUMsq6kz7Qhr+iloiUtfiU7ZTj
4OIgd60NfywbRLBVV/VVDXQc
-----END PRIVATE KEY-----`;

  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));

  const sigInput = `${header}.${claim}`;
  const signature = await rsaSign(sigInput, rawKey);
  const jwt = `${sigInput}.${signature}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Ajwt-bearer&assertion=${jwt}`
  });

  const data = await r.json();

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

// ───────── DRIVE FUNCTIONS ─────────
async function ensureFolder(token) {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(`name='DSR Reports' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await driveGet(`${DRIVE_API}/files?q=${q}&fields=files(id)`, token);

  if (r.files?.length) {
    cachedFolderId = r.files[0].id;
    return cachedFolderId;
  }

  const cr = await driveFetch(`${DRIVE_API}/files`, token, "POST", {
    name: "DSR Reports",
    mimeType: "application/vnd.google-apps.folder"
  });

  cachedFolderId = cr.id;
  return cachedFolderId;
}

async function listFiles(token) {
  const folderId = await ensureFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  return driveGet(`${DRIVE_API}/files?q=${q}`, token);
}

async function saveFile(token, body) {
  const folderId = await ensureFolder(token);

  const metadata = {
    name: body.fileName,
    mimeType: "application/json",
    parents: [folderId]
  };

  const r = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(metadata)
  });

  return r.json();
}

async function loadFile(token, id) {
  const r = await fetch(`${DRIVE_API}/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

async function deleteFile(token, id) {
  await fetch(`${DRIVE_API}/files/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

// ───────── HELPERS ─────────
async function driveGet(url, token) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

async function driveFetch(url, token, method, body) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function rsaSign(input, key) {
  const pem = key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(input)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function jsonResp(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });
}
