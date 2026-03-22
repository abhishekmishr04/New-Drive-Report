/**
 * DSR Dashboard — Cloudflare Worker (Final Fix)
 * Saves files into YOUR Google Drive (not service account's Drive)
 * by using driveId / corpora params and shared drive approach.
 */

const DRIVE_API  = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL  = "https://oauth2.googleapis.com/token";
const FOLDER_NAME = "DSR Reports";

const SA_EMAIL = "dsr-bot@dsr-dashboard-490713.iam.gserviceaccount.com";
const SA_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDJ4pf7vdGH2Goa\n3q42qafHB9M+W0qJbUiXb8L/x/ne9GQcghAe3N3G3OGykIwk1dKTuD4GjP7aLBVr\nnUQ9ns46umYHw7BWSMVDlcYlReoDJTkEU5IlgaZJtn/6+cfgqG36fIRgEh8oSS8A\nDsNWzpRU+mAVy2Zv3cyXaLHkOyKzvYQpwSMBf6Z4cq8eWwGSsIYR+SxGhtvJ+OLs\nQwTSH6Vf9x8tYTlVPyrkzAVb36prCeUWEDPOLR/rduGroTdSf9y7sU0YPCYNb3o/\nuM0+tIIUg+d5txpANP4Sl65ZDzXxcmR1ijH23gVc57YyTXKQ/FDQkrBK/We2zBnG\nqFxP8wMDAgMBAAECggEAPtH0qxAY6CWOdsf9++J047jqoce0fOj1orHTQtZOSXNQ\nx5ItQ/1EQYIv9OmHwlqKyQ6WtmEfWHJJRBBO0MHeuGWSJC5fa6n/QBWV77k+pTXq\n9Q6wNl2OifdxAX7CFIU0m7ItWtuouFd1eZYecJ+dhofWaFG/kWW6KQ8Z88P2+2ia\nXx517f5tQSPnCz6rWUX287urDAERf0WxexkYYbHeiHeWJfi4J8FDr7eBOkdaObC4\nS8anme55m6XWMqlAS53AahmDHTbHBJ8AzXNko6CDkvrVCBHA182Fq+2RUh/0trDa\nFEvtt2dxliUjDVdOW/9xjGZ3hrqvNCIqvs2q4k2B+QKBgQD53ncjr4BITze1EfMx\nwqwwoL/eOFnxlrZ8tyUbEH1xUtlTOjoxICv8emNTP6Azsw+xLFSE1GUOdJiLLvBh\nuH0vX4gxQS/0tNtwfmctOtkjBIlzqkCLybqcwjLLTm4o1Wyjv1r7yVuChSEc76S3\nXWSfLRxLBhapgrftS5UQKBqgNwKBgQDO1riRAi3TFpL8XnUpOwrr4pkDpLNxS3wi\nldh2SyO8/cMdw/DpvztInVxLM2022/5YdksZvAFxVSHTkyFmjnkuIkcyRrkv715a\n0Z+HphgdRts7bA5XAf27cPeLVdUmSIeLZVQONCxyE6ibNnPpHido+1kfRPLrqUwQ\nDD/aaQrVlQKBgERSkEExu+IJxzG7tsPkdzDUw6H/xphInZ18dqjv2V0jSkl3onHM\nWjqvPHmG7Ec2rxPDC1lGuls5hnyIWTJfP9u0Q4k0Seifi2E3Lv8vGDB7DRqTcxLG\nFkDG2Ry+VWDU+t/LcxVl+Z+2x1ciL+fzoY/kxde90nSHScOY5ymDzcQBAoGAS9Fr\nkEQDNihFMtsRCU8KPtMuEabS3Am2dBsHYL1EWWePmR6U9anSelisVyh/tSdJAXZD\nKyi+QqPZJWv+R1CcXOvVuzkvcsHEjXffiWK53il1/T8rtnsVXhsXsmyBGGpnvRIk\nkJxRWnOYT2TTcjVKbvILhinI/ddt+Uf0NARjI00CgYEA1DeBhOFzgRG4rIVoGCS2\nHeqEW0gLG8CHn7LmUkIUDsSAsKi3MfHxIg/rjBZe6hhNSeXpCNfoaV2tx5W3egRM\n3XGBYOW14QUvYh677VaehlIGv9Wk9Wf0alsja5BgdPAI0pmYTBnab7c3mj4kLjXH\nqM0DvJjHy1DM+XN5RhikZiQ=\n-----END PRIVATE KEY-----\n";

// !! IMPORTANT: Set this to your DSR Reports folder ID from Google Drive !!
// Get it from the URL when you open the folder: drive.google.com/drive/folders/FOLDER_ID_HERE
const SHARED_FOLDER_ID = "1bximvs0xra5nfmdkvbdbzjgmuuqptlbs";

let cachedToken = null, tokenExpiry = 0;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return ok({ status: "ok", folderId: SHARED_FOLDER_ID }, cors);
      }

      const token = await getToken();

      if (path === "/api/list")   return ok(await listFiles(token), cors);
      if (path === "/api/save")   return ok(await saveFile(token, await request.json()), cors);
      if (path === "/api/delete") return ok(await deleteFile(token, (await request.json()).id), cors);
      if (path === "/api/load") {
        const id = url.searchParams.get("id");
        if (!id) return ok({ error: "Missing id" }, cors, 400);
        return ok(await loadFile(token, id), cors);
      }
      return ok({ error: "Not found" }, cors, 404);
    } catch (err) {
      console.error("Error:", err.message);
      return ok({ error: err.message }, cors, 500);
    }
  }
};

// ── Auth ─────────────────────────────────────────────
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const pem = SA_KEY.replace(/\\n/g, "\n");
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", raw.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const now    = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64u(JSON.stringify({
    iss: SA_EMAIL, sub: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/drive",
    aud: TOKEN_URL, iat: now, exp: now + 3600
  }));

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claims}.${sig}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Auth failed: " + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// ── File Operations ───────────────────────────────────
async function listFiles(token) {
  // Search in your shared folder
  const q = encodeURIComponent(
    `'${SHARED_FOLDER_ID}' in parents and mimeType='application/json' and trashed=false`
  );
  const r = await fetch(
    `${DRIVE_API}/files?q=${q}&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return r.json();
}

async function saveFile(token, body) {
  const { fileName, data } = body;
  if (!fileName || !data) throw new Error("fileName and data required");

  // Save directly into your shared folder (no quota issue)
  const meta = JSON.stringify({
    name: fileName,
    mimeType: "application/json",
    parents: [SHARED_FOLDER_ID]
  });
  const cont = JSON.stringify(data);
  const bnd  = "dsr_bnd_2025";
  const mp   =
    `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${bnd}\r\nContent-Type: application/json\r\n\r\n${cont}\r\n` +
    `--${bnd}--`;

  const r = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary="${bnd}"`
      },
      body: mp
    }
  );
  const res = await r.json();
  if (!res.id) throw new Error("Save failed: " + JSON.stringify(res));
  return res;
}

async function loadFile(token, id) {
  const r = await fetch(
    `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`Load failed ${r.status}`);
  return r.json();
}

async function deleteFile(token, id) {
  if (!id) throw new Error("id required");
  await fetch(
    `${DRIVE_API}/files/${id}?supportsAllDrives=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return { ok: true };
}

function b64u(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function ok(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });
}
