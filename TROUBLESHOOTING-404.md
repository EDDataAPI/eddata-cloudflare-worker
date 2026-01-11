# 🔧 Cloudflare Worker 404 Errors - Quick Fix

## Problem
All API requests return 404 errors when accessing `api.eddata.dev`

## Root Cause
The Cloudflare Worker is configured with `ORIGIN_URL = "https://api.eddata.dev"` which creates an **infinite loop**:
1. Request comes to `api.eddata.dev`
2. Worker tries to forward to origin: `api.eddata.dev`
3. Request goes back to worker → Loop detected!

## Solution

### ✅ Fix the ORIGIN_URL Configuration

The `ORIGIN_URL` **MUST** point to your actual API server, NOT the Cloudflare Worker domain.

#### 1. Update wrangler.toml

Change:
```toml
ORIGIN_URL = "https://api.eddata.dev"  # ❌ WRONG - Creates loop!
```

To:
```toml
ORIGIN_URL = "https://origin.eddata.dev"  # ✅ CORRECT - Points to actual API server
```

Or use your server's direct IP:
```toml
ORIGIN_URL = "http://YOUR_SERVER_IP:3001"  # ✅ CORRECT - Direct connection
```

#### 2. Deploy Changes

**Option A: Via GitHub**
1. Commit changes to `wrangler.toml`
2. Push to main branch
3. GitHub Actions will auto-deploy

**Option B: Manual Deploy**
```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## Architecture

```
User Request
    ↓
api.eddata.dev (Cloudflare Worker)
    ↓
ORIGIN_URL (Your actual API server)
    ↓
Response
```

## Correct Configuration Examples

### Example 1: Separate Origin Domain
```toml
# DNS Setup:
# - api.eddata.dev → Cloudflare Worker (Proxied ON)
# - origin.eddata.dev → Your Server IP (Proxied OFF or A record)

ORIGIN_URL = "https://origin.eddata.dev"
```

### Example 2: Direct IP
```toml
# Use your server's IP address directly
ORIGIN_URL = "http://10.0.1.5:3001"
```

### Example 3: Dokploy/Docker Setup
```toml
# If API is on port 3001 of your server
ORIGIN_URL = "http://your-server-hostname:3001"
```

## DNS Configuration

### 1. Configure Origin Server

**Option A: Create origin subdomain (Recommended)**
```
Type: A
Name: origin
Value: YOUR_SERVER_IP
Proxy: OFF (Gray cloud) ← Important!
```

**Option B: Use different domain**
```
Use a completely different domain for origin
Example: api-origin.yourdomain.com
```

### 2. Configure Worker Domain
```
Type: A or CNAME
Name: api
Value: YOUR_SERVER_IP or origin.eddata.dev
Proxy: ON (Orange cloud) ← Must be enabled!
```

## Verification

### 1. Test Origin Server Directly
```bash
curl https://origin.eddata.dev/v2/version
# Should return: {"version":"1.0.0"}
```

### 2. Test Worker
```bash
curl https://api.eddata.dev/v2/version
# Should return: {"version":"1.0.0"}
# Headers should include: X-Cache: PASSTHROUGH
```

### 3. Check Loop Detection
```bash
curl -I https://api.eddata.dev/v2/version
# Should NOT return:
# - 500 "Configuration Error"
# - "ORIGIN_URL creates a loop"
```

## Common Mistakes

### ❌ Wrong: Worker Points to Itself
```toml
# Worker runs on: api.eddata.dev
ORIGIN_URL = "https://api.eddata.dev"  # Creates loop!
```

### ❌ Wrong: Both Domains Point to Same Worker
```toml
# DNS:
# api.eddata.dev → Cloudflare Worker (Proxied ON)
# origin.eddata.dev → Cloudflare Worker (Proxied ON)  # Wrong!

ORIGIN_URL = "https://origin.eddata.dev"  # Still a loop!
```

### ✅ Correct: Separate Worker and Origin
```toml
# DNS:
# api.eddata.dev → Cloudflare Worker (Proxied ON)
# origin.eddata.dev → Server IP (Proxied OFF)  # Correct!

ORIGIN_URL = "https://origin.eddata.dev"  # No loop!
```

## Current Setup Check

Run this command to see your current configuration:
```bash
cat wrangler.toml | grep ORIGIN_URL
```

Should show:
```toml
ORIGIN_URL = "https://origin.eddata.dev"  # ✅ Good!
```

NOT:
```toml
ORIGIN_URL = "https://api.eddata.dev"  # ❌ Bad!
```

## Need Help?

If you're still seeing 404 errors after fixing ORIGIN_URL:

1. **Check DNS Records**
   ```bash
   nslookup api.eddata.dev
   nslookup origin.eddata.dev
   ```

2. **Verify Origin Server is Running**
   ```bash
   curl http://YOUR_SERVER_IP:3001/health
   ```

3. **Check Cloudflare Worker Logs**
   ```bash
   wrangler tail
   ```

4. **Clear Cloudflare Cache**
   - Dashboard → Caching → Purge Everything

## Summary

**Problem**: 404 on all API requests  
**Cause**: ORIGIN_URL points to worker domain (loop)  
**Fix**: Set ORIGIN_URL to actual server  
**Result**: Worker → Origin Server → Response ✅
