# EDData Cloudflare Worker - Setup Guide

This guide walks you through configuring the EDData Cloudflare Worker. The repository is already connected to Cloudflare with automatic deployment via GitHub Actions.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Cloudflare Account Setup](#cloudflare-account-setup)
3. [GitHub Secrets Configuration](#github-secrets-configuration)
4. [Worker Configuration](#worker-configuration)
5. [Domain Setup](#domain-setup)
6. [Automatic Deployment](#automatic-deployment)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Cloudflare Account** (free tier works!)
  - Sign up at [cloudflare.com](https://www.cloudflare.com/)
- **GitHub Access** to this repository with write permissions
- **Domain** managed by Cloudflare (`eddata.dev`)

---

## Cloudflare Account Setup

### Step 1: Get Your Account ID

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Select any domain (or skip if you don't have one)
3. Scroll down in the right sidebar
4. Copy your **Account ID**
5. Save it securely - you'll need it for GitHub Secrets

### Step 2: Create API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template
4. Click **"Continue to summary"**
5. Click **"Create Token"**
6. Copy the token and save it securely - you'll need it for GitHub Secrets

**Important:** Keep your API token secret! It provides access to your Cloudflare account.

---

## GitHub Secrets Configuration

Configure GitHub Secrets to enable automatic deployment:

### Step 1: Access Repository Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. You should see existing secrets (if already configured)

### Step 2: Verify or Add Required Secrets

Ensure these secrets exist (add them if missing):

**Secret 1: CLOUDFLARE_API_TOKEN**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: Your Cloudflare API token from Step 2 above

**Secret 2: CLOUDFLARE_ACCOUNT_ID**
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: Your Cloudflare Account ID from Step 1 above

### Step 3: Verify Secrets

The secrets page should show:
- ✅ CLOUDFLARE_API_TOKEN
- ✅ CLOUDFLARE_ACCOUNT_ID

---

## Worker Configuration

Edit the configuration files in the repository via GitHub web interface or locally:

### Step 1: Configure Origin URLs

Edit `wrangler.jsonc`:

```json
{
  "vars": {
    "ENVIRONMENT": "production",
    "ORIGIN_URL": "https://your-actual-origin-server.com",
    "FAILOVER_URL": "https://backup-origin-server.com",
    "VERSION": "1.0.0",
    "ENABLE_METRICS": "false"
  }
}
```

**Important Configuration:**
- `ORIGIN_URL`: Your primary API server URL
  - ⚠️ Do NOT use `api.eddata.dev` (this would create a loop!)
  - Use your actual origin server hostname or IP
  - Examples: `https://origin.eddata.dev`, `http://10.0.0.5:3000`
  
- `FAILOVER_URL`: Your backup API server URL (optional)
  - Set to `"none"` or remove if you don't have a backup server
  - Should point to a different server than ORIGIN_URL

- `ENABLE_METRICS`: Set to `"true"` to enable `/metrics` endpoint

### Step 2: Verify Route Configuration

The route is already configured in `wrangler.jsonc`:

```json
{
  "routes": [
    {
      "pattern": "api.eddata.dev/*",
      "zone_name": "eddata.dev"
    }
  ]
}
```

This configuration means:
- All requests to `api.eddata.dev/*` go through the worker
- Worker caches `/cache/*` requests
- Worker passes through `/api/*` and other requests to your origin server

---

## Domain Setup

Configure your domain in Cloudflare to route traffic through the worker.

### Step 1: Verify Domain in Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Verify your domain (`eddata.dev`) is active in Cloudflare
3. If not, add your domain:
   - Click **Add a Site**
   - Enter `eddata.dev`
   - Select the **Free** plan
   - Update nameservers at your registrar

### Step 2: Configure DNS for API Subdomain

1. Go to Cloudflare Dashboard → `eddata.dev`
2. Go to **DNS** → **Records**
3. Find or add the record for `api.eddata.dev`:

**Option A: Point to Origin Server IP (Recommended)**
- Type: `A`
- Name: `api`
- IPv4 address: `YOUR_ORIGIN_SERVER_IP`
- Proxy status: **Proxied** (orange cloud) ✅ **MUST BE ENABLED**

**Option B: Point to Origin Server Hostname**
- Type: `CNAME`
- Name: `api`
- Target: `your-origin-server.example.com`
- Proxy status: **Proxied** (orange cloud) ✅ **MUST BE ENABLED**

**Critical:** The orange cloud (Proxied) MUST be enabled! This routes traffic through Cloudflare and enables the worker.

### Step 3: Verify DNS

Wait 2-5 minutes for DNS propagation, then verify:

```bash
# Should resolve to a Cloudflare IP (not your origin IP)
nslookup api.eddata.dev
```

If you see a Cloudflare IP address, the proxy is working correctly.

---

## Automatic Deployment

The worker deploys automatically via GitHub Actions when you push changes.

### How It Works

1. You edit configuration files (e.g., `wrangler.jsonc`, `worker.js`)
2. Commit changes to the `main` branch (via GitHub web UI or git)
3. GitHub Actions automatically:
   - Detects the change
   - Builds the worker
   - Deploys to Cloudflare
   - Updates the route on `api.eddata.dev`

### Step 1: Make Configuration Changes

Edit files directly on GitHub:
1. Go to your repository on GitHub
2. Navigate to the file (e.g., `wrangler.jsonc`)
3. Click the **pencil icon** to edit
4. Make your changes
5. Click **Commit changes**
6. Add a commit message
7. Click **Commit changes**

### Step 2: Monitor Deployment

1. Go to your GitHub repository
2. Click **Actions** tab
3. You'll see the deployment workflow running
4. Wait for the green checkmark ✅ (usually 1-2 minutes)

### Step 3: Check Deployment Logs

Click on the workflow run to see:
- Build logs
- Deployment status
- Worker URL
- Any errors or warnings

**Example Success Output:**
```
✅ Uploaded eddata-api-gateway
✅ Published eddata-api-gateway
✅ https://eddata-api-gateway.YOUR_SUBDOMAIN.workers.dev
```

---

## Verification

Verify your worker is deployed and working correctly.

### Step 1: Check Worker Status in Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click **eddata-api-gateway**
4. Verify:
   - Status: **Deployed**
   - Route: `api.eddata.dev/*`
   - Last deployed: Recent timestamp

### Step 2: Test Health Endpoint

```bash
curl https://api.eddata.dev/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "EDData Collector Worker",
  "version": "1.0.0",
  "timestamp": "2026-01-05T12:00:00.000Z",
  "environment": "production",
  "origin": "https://your-origin-server.com",
  "failover": "https://backup-origin-server.com",
  "features": {
    "staleWhileRevalidate": true,
    "retryLogic": true,
    "compression": true,
    "securityHeaders": true,
    "failover": true
  }
}
```

### Step 3: Test Cache Endpoint

```bash
# First request (cache MISS)
curl -I https://api.eddata.dev/cache/commodity-ticker.json
```

**Expected Headers:**
- `X-Cache: MISS`
- `X-Worker-Version: 1.0.0`
- `X-Response-Time: Xms`

```bash
# Second request (cache HIT)
curl -I https://api.eddata.dev/cache/commodity-ticker.json
```

**Expected Headers:**
- `X-Cache: HIT`
- `X-Cache-Status: fresh`
- `Age: X` (seconds since cached)

### Step 4: Test API Passthrough

```bash
curl -I https://api.eddata.dev/api/v1/systems
```

**Expected Headers:**
- `X-Cache: PASSTHROUGH`
- `X-Passthrough: true`
- `X-Worker-Version: 1.0.0`

This confirms non-cache requests are being forwarded to your origin server.

### Step 5: Monitor in Cloudflare Dashboard

1. Go to **Workers & Pages** → **eddata-api-gateway**
2. View **Metrics**:
   - Requests per second
   - Success rate
   - CPU time
   - Errors

---

## Troubleshooting

### Issue: "Deployment fails in GitHub Actions"

**Symptoms:**
- Red X on GitHub Actions
- Error in workflow logs

**Solutions:**

1. **Verify GitHub Secrets:**
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Check `CLOUDFLARE_API_TOKEN` exists
   - Check `CLOUDFLARE_ACCOUNT_ID` exists
   - Recreate if necessary

2. **Check API Token Permissions:**
   - Token must have "Edit Cloudflare Workers" permission
   - Create new token if needed

3. **Review Workflow Logs:**
   - Go to **Actions** tab
   - Click failed workflow
   - Read error messages for specific issues

### Issue: "Worker name mismatch"

**Error Message:**
```
Worker name "eddata-collector" doesn't match "eddata-api-gateway"
```

**Solution:**
The worker name in `wrangler.jsonc` must be `eddata-api-gateway`:

```json
{
  "name": "eddata-api-gateway"
}
```

### Issue: "Origin returns 500/502 errors"

**Symptoms:**
- Worker returns errors
- Clients see 502 Bad Gateway

**Possible Causes:**
1. `ORIGIN_URL` is incorrect or unreachable
2. Origin server is down
3. `ORIGIN_URL` points to `api.eddata.dev` (creates a loop!)

**Solutions:**

1. **Verify ORIGIN_URL:**
   ```json
   "ORIGIN_URL": "https://your-actual-origin.com"
   ```
   ⚠️ Must NOT be `api.eddata.dev`

2. **Check Origin Server:**
   - Verify origin server is running
   - Test direct access: `curl https://your-origin-server.com/api/v1/test`

3. **Check Firewall:**
   - Ensure origin server accepts requests from Cloudflare IPs
   - Allow Cloudflare IP ranges: [cloudflare.com/ips](https://www.cloudflare.com/ips/)

### Issue: "Cache not working"

**Symptoms:**
- Always shows `X-Cache: MISS`
- No cache hits

**Solutions:**

1. **Verify Path:**
   - Only `/cache/*` paths are cached
   - Example: `api.eddata.dev/cache/commodity-ticker.json` ✅
   - Example: `api.eddata.dev/api/data.json` ❌ (not cached)

2. **Check Response:**
   - Origin must return HTTP 200
   - Origin must return valid JSON
   - Check: `curl -I https://api.eddata.dev/cache/your-file.json`

3. **Clear Cache:**
   - Go to Cloudflare Dashboard → **Caching** → **Configuration**
   - Click **Purge Everything**
   - Test again

### Issue: "DNS not resolving"

**Symptoms:**
- `api.eddata.dev` doesn't resolve
- Connection timeout

**Solutions:**

1. **Check DNS Record:**
   - Go to Cloudflare → DNS → Records
   - Verify `api` record exists
   - Verify Proxy is **ON** (orange cloud)

2. **Wait for Propagation:**
   - DNS changes take 2-5 minutes
   - Test with: `nslookup api.eddata.dev`

3. **Verify Nameservers:**
   - Domain must use Cloudflare nameservers
   - Check at your domain registrar

### Issue: "Failover not working"

**Symptoms:**
- Worker returns errors when primary origin is down
- Failover doesn't activate

**Solutions:**

1. **Verify Failover URL:**
   ```json
   "FAILOVER_URL": "https://your-backup-server.com"
   ```

2. **Check Failover Server:**
   - Test direct access: `curl https://your-backup-server.com/cache/test.json`
   - Ensure it returns same data format as primary

3. **Review Logs:**
   - Check Cloudflare Dashboard → Workers → Logs
   - Look for "trying failover" messages

### Issue: "Worker not receiving requests"

**Symptoms:**
- Worker metrics show zero requests
- Route not working

**Solutions:**

1. **Verify Route:**
   - Go to Cloudflare → Workers & Pages → eddata-api-gateway
   - Check **Routes** tab
   - Should show: `api.eddata.dev/*`

2. **Check DNS Proxy:**
   - DNS record must have **Proxy ON** (orange cloud)
   - Without proxy, worker won't receive requests

3. **Redeploy:**
   - Make a small change to trigger redeployment
   - Edit `wrangler.jsonc` (e.g., add a comment)
   - Commit the change
   - Wait for GitHub Actions to complete

---

## Advanced Configuration

### Adjust Cache TTL

Edit `worker.js` to customize cache durations:

```javascript
const CACHE_TTL = {
  'commodity-ticker.json': 1800,  // 30 minutes
  'galnet-news.json': 7200,       // 2 hours
  'database-stats.json': 600,     // 10 minutes
  'commodities.json': 86400,      // 24 hours
  default: 3600                   // 1 hour
}
```

Commit changes to deploy automatically.

### Enable Metrics Endpoint

Edit `wrangler.jsonc`:

```json
{
  "vars": {
    "ENABLE_METRICS": "true"
  }
}
```

Access metrics at: `https://api.eddata.dev/metrics`

### Configure Multiple Origins

For load balancing or region-specific origins, you can extend the worker code to select origins based on request parameters or geolocation.

---

## Support & Resources

- **Documentation**: [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/EDDataAPI/eddata-cloudflare-worker/issues)
- **Cloudflare Docs**: [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/)
- **GitHub Actions**: [docs.github.com/actions](https://docs.github.com/en/actions)

---

**Your EDData Cloudflare Worker is now deployed and running! 🎉**

All changes to the repository will automatically deploy via GitHub Actions - no manual deployment needed!
