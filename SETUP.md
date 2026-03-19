# DSR Dashboard — Multi-User Setup Guide
## No sign-in for users · Central Google Drive · GitHub Pages + Cloudflare Workers

---

## Architecture Overview

```
[Any User's Browser]
       ↓  uploads DSR Excel, no login needed
[GitHub Pages — index.html]
       ↓  API calls (save / load / list)
[Cloudflare Worker — worker.js]   ← FREE, handles auth
       ↓  authenticated Drive API calls
[Admin's Google Drive — "DSR Reports" folder]
```

**Users never sign in. Only you (admin) set this up once.**

---

## What You Need
- Google Account (admin)
- GitHub Account (free)
- Cloudflare Account (free — workers.dev)
- ~20 minutes

---

## STEP 1 — Google Service Account

A Service Account is like a "bot" that can access your Drive without anyone signing in.

### 1a. Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click project dropdown → **New Project** → name it `DSR Dashboard` → **Create**

### 1b. Enable Google Drive API
1. **APIs & Services → Library**
2. Search **Google Drive API** → **Enable**

### 1c. Create Service Account
1. **APIs & Services → Credentials**
2. **+ Create Credentials → Service Account**
3. Name: `dsr-dashboard-bot` → **Create and Continue** → **Done**
4. Click the service account email that appeared in the list
5. Go to **Keys** tab → **Add Key → Create new key → JSON** → **Create**
6. A `.json` file downloads — **keep this safe, never share it**

### 1d. Share Your Drive Folder With the Service Account
1. Open [drive.google.com](https://drive.google.com)
2. Create a folder called **DSR Reports** (or let the app create it)
3. Right-click the folder → **Share**
4. Paste the service account email (looks like `dsr-dashboard-bot@your-project.iam.gserviceaccount.com`)
5. Set role to **Editor** → **Send**

---

## STEP 2 — Deploy Cloudflare Worker

### 2a. Create Cloudflare Account
1. Go to [cloudflare.com](https://cloudflare.com) → Sign up (free)

### 2b. Create a Worker
1. Dashboard → **Workers & Pages** → **Create Application** → **Create Worker**
2. Name it: `dsr-dashboard`
3. Click **Deploy** (ignore the default code for now)
4. Click **Edit code**
5. **Delete all existing code** and paste the entire contents of `worker.js`
6. Click **Save and Deploy**

Your worker URL will be:
```
https://dsr-dashboard.YOUR-SUBDOMAIN.workers.dev
```

### 2c. Set Secret Environment Variables
In the Worker dashboard → **Settings → Variables → Environment Variables**

Click **Add variable** for each:

| Variable Name | Value | Type |
|---|---|---|
| `SERVICE_ACCOUNT_EMAIL` | `dsr-dashboard-bot@your-project.iam.gserviceaccount.com` | Text |
| `SERVICE_ACCOUNT_KEY` | The entire `private_key` field from your JSON file | **Secret** |
| `ALLOWED_ORIGIN` | `https://YOUR_USERNAME.github.io` | Text |

> **Important for SERVICE_ACCOUNT_KEY:**
> Open your downloaded JSON file, find the `"private_key"` field.
> Copy the entire value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.
> Paste it exactly as-is into the Secret field.

Click **Save and Deploy** after adding variables.

### 2d. Test the Worker
Visit: `https://dsr-dashboard.YOUR-SUBDOMAIN.workers.dev/api/health`

You should see: `{"status":"ok","folder":null}`

If you see an error, check your environment variables.

---

## STEP 3 — Deploy Frontend to GitHub Pages

### 3a. Edit index.html
Open `index.html` and find this line near the top of the `<script>` section:

```javascript
const WORKER_URL = 'https://YOUR_WORKER_NAME.YOUR_SUBDOMAIN.workers.dev';
```

Replace with your actual Worker URL:
```javascript
const WORKER_URL = 'https://dsr-dashboard.myname.workers.dev';
```

### 3b. Push to GitHub
1. Create a new **public** GitHub repository called `dsr-dashboard`
2. Upload `index.html` to the root

```bash
git init
git add index.html
git commit -m "DSR Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dsr-dashboard.git
git push -u origin main
```

### 3c. Enable GitHub Pages
1. Repository → **Settings → Pages**
2. Source: **Deploy from branch**
3. Branch: **main** · Folder: **/ (root)**
4. Save

Your app will be live at:
```
https://YOUR_USERNAME.github.io/dsr-dashboard/
```

Share this URL with your team — **no sign-in needed**.

---

## How It Works For Your Team

| User Action | What Happens |
|---|---|
| Open the URL | App loads, connects to team Drive automatically |
| Upload DSR Excel | Parses data, auto-saves JSON to your Drive |
| Click Load from Drive | Sees all team reports, can load any |
| Browse days / generate report | Works fully offline after loading |
| Click Save to Drive | Saves updated report (after entering Ads Spend) |
| Click Delete | Removes a report from Drive |

**All reports appear in a `DSR Reports` folder in YOUR Google Drive.**

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Drive unavailable` on load | Check WORKER_URL in index.html is correct |
| Worker health returns error | Check SERVICE_ACCOUNT_EMAIL and KEY in Cloudflare |
| `Token error` in Worker logs | Verify the private_key includes the full PEM headers |
| CORS error in browser | Verify ALLOWED_ORIGIN matches your GitHub Pages URL exactly |
| Files not appearing in Drive | Ensure you shared the DSR Reports folder with the service account email |
| "Not found" error | Make sure your Worker routes are deployed correctly |

### View Worker Logs
Cloudflare Dashboard → Workers → dsr-dashboard → **Logs** tab
Real-time logs show every request and any errors.

---

## Security Notes

- `SERVICE_ACCOUNT_KEY` is stored as a **Secret** in Cloudflare — never exposed to browsers
- The service account only has access to files it creates (Drive scope: `drive`)
- Users can only read/write files in the shared `DSR Reports` folder
- No user data or personal information is collected
- The Worker URL is public but only performs Drive operations — no sensitive data is returned except DSR report data

---

## Cost

| Service | Cost |
|---|---|
| GitHub Pages | Free |
| Cloudflare Workers | Free (100,000 requests/day) |
| Google Drive API | Free (generous quota) |
| Google Service Account | Free |

**Total: ₹0**
