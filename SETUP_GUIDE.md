# EDData Cloudflare Worker - Complete Setup Guide

This guide walks you through deploying the EDData Cloudflare Worker using GitHub Actions (CI/CD). No local installation required!

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Cloudflare Account Setup](#cloudflare-account-setup)
3. [GitHub Repository Setup](#github-repository-setup)
4. [Configuration](#configuration)
5. [Deployment](#deployment)
6. [Custom Domain Setup (Optional)](#custom-domain-setup-optional)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following:

### Required
- **Cloudflare Account** (free tier works!)
  - Sign up at [cloudflare.com](https://www.cloudflare.com/)
- **GitHub Account** (for CI/CD deployments)

### Optional
- **Custom Domain** managed by Cloudflare

---

---

## Cloudflare Account Setup

### Step 1: Get Your Account ID

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Select any domain (or skip if you don't have one)
3. Scroll down in the right sidebar
4. Copy your **Account ID**

### Step 2: Create API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template
4. Click **"Continue to summary"**
5. Click **"Create Token"**
6. Copy the token and save it securely (you'll need it for GitHub)

---

## GitHub Repository Setup

### Step 1: Fork or Clone the Repository

1. Go to [github.com/EDDataAPI/eddata-cloudflare-worker](https://github.com/EDDataAPI/eddata-cloudflare-worker)
2. Click **"Fork"** to create your own copy
3. Or clone directly to your organization/account

### Step 2: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add the following secrets:

**Secret 1: CLOUDFLARE_API_TOKEN**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: Your Cloudflare API token from previous step

**Secret 2: CLOUDFLARE_ACCOUNT_ID**
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: Your Cloudflare Account ID

---

## Configuration

### Step 1: Update Worker Configuration

Edit `wrangler.jsonc` in your repository:

```json
{
  "name": "eddata-api-gateway",
  "main": "worker.js",
  "compatibility_date": "2026-01-05",
  
  "workers_dev": true,
  "preview_urls": true,
  
  "vars": {
    "ENVIRONMENT": "production",
    "ORIGIN_URL": "https://api.eddata.dev",
    "VERSION": "1.0.0",
    "ENABLE_METRICS": "false"
  }
}
```

**Note:** The `account_id` is not needed when using GitHub Secrets.

### Step 2: Configure Origin URL (if needed)

If your API is hosted at a different URL, update the `ORIGIN_URL` variable:

```json
"vars": {
  "ORIGIN_URL": "https://your-api-domain.com"
}
```

### Step 3: Enable Metrics (Optional)

To enable the `/metrics` endpoint:

```json
"vars": {
  "ENABLE_METRICS": "true"
}
```

---

## Deployment

### Step 1: Commit and Push Changes

```bash
git add .
git commit -m "Configure worker for deployment"
git push origin main
```

### Step 2: Monitor Deployment

1. Go to your GitHub repository
2. Click **"Actions"** tab
3. You'll see the deployment workflow running
4. Wait for the green checkmark ✅

### Step 3: Get Your Worker URL

After successful deployment, check the workflow logs for your worker URL:
```
https://eddata-api-gateway.YOUR_SUBDOMAIN.workers.dev
```

Or find it in the Cloudflare Dashboard:
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click **eddata-api-gateway**
4. Copy the URL

### Step 4: Test Your Deployment

```bash
curl https://eddata-api-gateway.YOUR_SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "EDData Collector Worker",
  "version": "1.0.0",
  "timestamp": "2026-01-05T12:00:00.000Z",
  "environment": "production",
  "origin": "https://api.eddata.dev",
  "features": {
    "staleWhileRevalidate": true,
    "retryLogic": true,
    "compression": true,
    "securityHeaders": true
  }
}
```

---

## Custom Domain Setup (Optional)

If you have a domain managed by Cloudflare:

### Step 1: Add Route to Configuration

Edit `wrangler.jsonc` in your repository:

```json
{
  "name": "eddata-api-gateway",
  "routes": [
    {
      "pattern": "cache.yourdomain.com/*",
      "zone_name": "yourdomain.com"
    }
  ]
}
```

### Step 2: Push Changes

```bash
git add wrangler.jsonc
git commit -m "Add custom domain route"
git push origin main
```

GitHub Actions will automatically redeploy with the new route.

### Step 3: Create DNS Record

1. Go to Cloudflare Dashboard
2. Select your domain
3. Go to **DNS** → **Records**
4. Add a **CNAME** record:
   - Type: `CNAME`
   - Name: `cache`
   - Target: `eddata-api-gateway.YOUR_SUBDOMAIN.workers.dev`
   - Proxy status: **Proxied** (orange cloud)

### Step 4: Test Custom Domain

```bash
curl https://cache.yourdomain.com/health
```

---

## Verification

### Step 1: Check Worker Status in Cloudflare Dashboard

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click your worker name (`eddata-api-gateway`)
4. View **Metrics**:
   - Requests per second
   - Errors
   - CPU time
   - Duration

### Step 2: Test Cache Behavior

#### Test Cache MISS
```bash
curl -I https://your-worker-url/cache/commodity-ticker.json
```

Look for: `X-Cache: MISS`

#### Test Cache HIT (repeat same request)
```bash
curl -I https://your-worker-url/cache/commodity-ticker.json
```

Look for: `X-Cache: HIT` and `X-Cache-Status: fresh`

#### Test Stale-While-Revalidate
Wait for TTL to expire (default: 1 hour for commodity-ticker), then:
```bash
curl -I https://your-worker-url/cache/commodity-ticker.json
```

Look for: `X-Cache: HIT` and `X-Cache-Status: stale`

---

## Troubleshooting

### Issue: "Deployment fails in GitHub Actions"

**Solution:**
1. Verify GitHub Secrets are set correctly:
   - Go to **Settings** → **Secrets and variables** → **Actions**
   - Check `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist
2. Check workflow file syntax in `.github/workflows/`
3. Ensure `wrangler.jsonc` is committed to repository
4. Review GitHub Actions logs for specific error messages

### Issue: "Worker name mismatch"

**Solution:** The CI system may expect a different worker name. Update `wrangler.jsonc`:

```json
{
  "name": "eddata-api-gateway"
}
```

### Issue: "Missing entry-point to Worker script"

**Solution:** Ensure `wrangler.jsonc` has the correct main file:

```json
{
  "name": "eddata-api-gateway",
  "main": "worker.js"
}
```

### Issue: "Origin returns 500/502 errors"

**Possible Causes:**
1. Origin server is down
2. Incorrect `ORIGIN_URL` configuration
3. CORS issues

**Solution:**
1. Check origin server status
2. Verify `ORIGIN_URL` in `wrangler.jsonc`
3. Check origin server CORS settings
4. Review worker logs in Cloudflare Dashboard

### Issue: "Cache not working"

**Possible Causes:**
1. Cache headers not set correctly
2. TTL too low
3. Browser caching interfering

**Solution:**
1. Check response headers: `curl -I your-worker-url/cache/file.json`
2. Verify TTL settings in `worker.js`
3. Test with `curl` instead of browser
4. Clear browser cache

### Issue: "GitHub Actions deployment is slow"

**Solution:**
- Ensure `package-lock.json` is committed to repository
- This enables dependency caching and speeds up builds

### Issue: "Cannot access worker URL"

**Solution:**
1. Check deployment succeeded in GitHub Actions
2. Verify worker name matches in Cloudflare Dashboard
3. Check for typos in the URL
4. Wait a few minutes for DNS propagation

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

Commit and push changes to deploy automatically.

### Enable Analytics

Edit `wrangler.jsonc`:

```json
{
  "analytics_engine_datasets": [
    {
      "binding": "ANALYTICS"
    }
  ],
  "vars": {
    "ENABLE_ANALYTICS": "true"
  }
}
```

---

## Next Steps

- ✅ Monitor your worker in Cloudflare Dashboard
- ✅ Set up alerts for errors/downtime
- ✅ Configure custom domain
- ✅ Review and optimize cache TTL settings
- ✅ Enable analytics and monitoring
- ✅ Set up automated tests

---

## Support & Resources

- **Documentation**: [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/EDDataAPI/eddata-cloudflare-worker/issues)
- **Cloudflare Docs**: [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/)
- **GitHub Actions**: [docs.github.com/actions](https://docs.github.com/en/actions)

---

**Congratulations! Your EDData Cloudflare Worker is now deployed via GitHub Actions! 🎉**
