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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
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
        const body = await request.json();
        await deleteFile(token, body.id);
        return jsonResp({ ok: true }, cors);
      }

      if (path === "/api/health") {
        return jsonResp({ status: "ok", folder: cachedFolderId }, cors);
      }

      return jsonResp({ error: "Not found" }, cors, 404);
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResp({ error: err.message }, cors, 500);
    }
  }
};

// ───────── TOKEN MANAGEMENT ─────────
async function getAccessToken() {
  // Check if cached token is still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const email = "dsr-report@dsr-dashboard-490713.iam.gserviceaccount.com";
  const rawKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCroEd98My4BXwI
qklkXESDdRqeBUkU+acVjIEoRrRgo3vYgrNddtRTrGPw1DX+tV4J+mN/TADGx9BT
1d4K+zlqIhV54OsFJ1acR1x68B9Rm36NdMnmHwUnqinfgnHBidgfqRj9n10DlIQg
0VpDlHRumdSvAZfxgYzqRfU2d2JHXWtg/nf3IZPv088HlD+E5PySJXBJFrLIj8dU
L0qP2RJcTxV5qaqTIM1YZSGNpXLnGkZPJTA+tOwtfx72sJ2mtYeZ/etsfqyT3I2T
tmBz03W4j1adt4m4tPJw/LSQjFUkh2GQDDe2b3Ah7YwAq7vjKrlNaVMMqAw45VnO
Xh8tkOi/AgMBAAECggEAA9dyGVUSkOglL/0iBN3LLwc2LHqL62XiggyxzIVFhgDo
IgnOBTl/TxPwQzEGm7ZTA0PUsRdc0GuU5XcOqOpgjTvlTCruR8syH+/yiUPt6xc2
blq0Q1aqv3u1GMqdE5IAz9QqpKXJ7u1N1H2OtUn8czLgZsxtnE0c//ockNpDItgZ
cvs4Sp4oyE1CBem50b8nTQOG+aO3jALuO/R73tmoOE31EIBX9bN61Jq8xOKpHNEX
cMR+NjN76XBAJ/2xTXUR4cHN/wHfR1ijLOmL6zYDYU+yt+UzYSAaMFEiCGXtTghF
jJaG1VCs4NXLUHM0xMLZXZBBIIe+kdC5lzn28mHA1QKBgQDisv8yOGtnVM3bpVmY
oE2ON5yVUON2yPRweZWjJW/NFk/wTClqkokjJOM+UQ700Jse6+J3WVOB8mpQ6CMX
42/Td9hHvxCErqCo4SD2Hg7TiaTQ6Uosmx5KkC4jypbt8HC0FciGiKeAfxVrfBUF
mSCajJ+OlXWK1+hyMlnuhbrehQKBgQDBzwcvPeal3o/sc3FohOy4dpBrY2KU+rR5
g7uHtmMclHecWQxVA3kF0LFCwEeJJO+Xht9tpbUfVvcXmcqoQtCL8ECdksC80DhI
cTClAPoEt2jxD+VBGRBmomHIg85YRTda/J8kAaqpbBDTwfmJAktdnLiBhP8aj60/
G1ez6m0XcwKBgH0E1bOuZZzQqc5Nu8Ft9hdOF+5Ic4jYfeVhR+J3DNb/TQpqFhUN
xs840pFVRnhAaqt8zqGfA2yQcY0419GevdbTKtU2SzfAzh0UOodAQFDsgZYscZlz
2hqotKlMWjvR83V85d87kZRNgVSLU1SJA+/3SS7qwa3WL/x6RBpEaa+5AoGALJVX
bcKroFSGfzo/SG/rlLORnWKLdwIFKj7nkNygCB8PNOQ3NgdKe8/6NwTMb/wTMaRR
GYQZGlCDHua9+98C4m4uLxFnTQgJKoD/U7XZzePzPCEP992wLCwGmn3Xpe6mQUQD
x+CqRbcaV9wzbxUcCTjYKNNTa+TJUc8UacrvtYkCgYB4kZBrr89TtgSe66a/X4ic
amdErm5fjJeysvk9XxmI40s/ThTi5a+Y5A3wJh6nyM/XkaBVktPrEKRX5msPMyQ9
hbkQ3m0nybhnFL89jSYyd1h5RXHg5AVQb43cvrzZgq84XgZq8uDLn9rCV55H2ORz
IReCbU0WyDbUwPM7e/YZig==
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
    body: `grant_type=urn%3Aietf%3Aparams%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`
  });

  if (!r.ok) {
    const errData = await r.json();
    throw new Error(`Token error: ${errData.error_description || errData.error}`);
  }

  const data = await r.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer

  console.log("Token acquired, expires in:", data.expires_in, "seconds");
  return cachedToken;
}

// ───────── DRIVE OPERATIONS ─────────
async function ensureFolder(token) {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(
    `name='${DSR_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  
  const r = await driveGet(
    `${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name)`,
    token
  );

  if (r.files?.length) {
    cachedFolderId = r.files[0].id;
    console.log("Found existing DSR Reports folder:", cachedFolderId);
    return cachedFolderId;
  }

  console.log("Creating new DSR Reports folder...");
  const createResp = await driveFetch(`${DRIVE_API}/files`, token, "POST", {
    name: DSR_FOLDER_NAME,
    mimeType: "application/vnd.google-apps.folder"
  });

  cachedFolderId = createResp.id;
  console.log("Created new folder:", cachedFolderId);
  return cachedFolderId;
}

async function listFiles(token) {
  const folderId = await ensureFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const result = await driveGet(
    `${DRIVE_API}/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime,size)&pageSize=100&orderBy=modifiedTime desc`,
    token
  );
  console.log("Listed files:", result.files?.length || 0);
  return result;
}

async function saveFile(token, body) {
  const folderId = await ensureFolder(token);

  const metadata = {
    name: body.fileName,
    mimeType: "application/json",
    parents: [folderId]
  };

  // Create multipart body
  const boundary = "===============7330845974216740156==";
  const metadataStr = JSON.stringify(metadata);
  const fileContent = JSON.stringify(body.data);

  const multipartBody = 
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataStr}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${fileContent}\r\n` +
    `--${boundary}--`;

  console.log("Uploading file:", body.fileName, "size:", fileContent.length);

  const r = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`
    },
    body: multipartBody
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error("Upload error:", r.status, errText);
    throw new Error(`Save failed: ${r.status} - ${errText}`);
  }

  const result = await r.json();
  console.log("File saved:", result.id);
  return { id: result.id, name: result.name, success: true };
}

async function loadFile(token, fileId) {
  if (!fileId) throw new Error("No file ID provided");
  
  console.log("Loading file:", fileId);
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!r.ok) {
    throw new Error(`Load failed: ${r.status}`);
  }

  return r.json();
}

async function deleteFile(token, fileId) {
  if (!fileId) throw new Error("No file ID provided");
  
  console.log("Deleting file:", fileId);
  const r = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!r.ok && r.status !== 204) {
    throw new Error(`Delete failed: ${r.status}`);
  }
  console.log("File deleted");
}

// ───────── HELPERS ─────────
async function driveGet(url, token) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error("GET error:", r.status, errText);
    throw new Error(`Drive API error: ${r.status} - ${errText}`);
  }

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

  if (!r.ok) {
    const errText = await r.text();
    console.error("Fetch error:", r.status, errText);
    throw new Error(`Drive API error: ${r.status} - ${errText}`);
  }

  return r.json();
}

function b64url(str) {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function rsaSign(input, key) {
  const pem = key
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "");

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
    headers: {
      "Content-Type": "application/json",
      ...cors
    }
  });
}
