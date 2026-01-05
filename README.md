# EDData Cloudflare Worker

A high-performance Cloudflare Worker that serves as a caching layer for the [EDData API](https://github.com/EDDataAPI/eddata-api). Optimized for Cloudflare's free tier (100,000 requests/day).

## 🚀 Features

- **Stale-While-Revalidate**: Serves stale content immediately while fetching fresh data in the background
- **Automatic Retry Logic**: Exponential backoff retry for origin failures (3 attempts)
- **Smart Caching**: Configurable TTL per file type with extended stale periods
- **Compression Support**: Accepts Brotli, Gzip, and Deflate compression
- **Security Headers**: Includes X-Frame-Options, CSP, and other security headers
- **CORS Enabled**: Full CORS support for browser-based applications
- **Analytics Ready**: Optional error logging and metrics endpoint
- **Health Checks**: Built-in health check endpoint for monitoring
- **Edge Performance**: Leverages Cloudflare's global edge network

## 📊 Architecture

```
Client Request
      ↓
Cloudflare Edge (Worker)
      ↓
   Cache Check
   ├─ Fresh? → Return immediately
   ├─ Stale? → Return + Background refresh
   └─ Miss?  → Fetch from origin (with retry)
      ↓
Origin Server (api.eddata.dev)
```

## 🔧 Configuration

### Cache TTL Settings

| File | Fresh TTL | Stale TTL | Description |
|------|-----------|-----------|-------------|
| `commodity-ticker.json` | 1 hour | 2 hours | Real-time market data |
| `galnet-news.json` | 1 hour | 2 hours | Galnet news feed |
| `database-stats.json` | 15 min | 30 min | Database statistics |
| `commodities.json` | 24 hours | 48 hours | Static commodity list |

### Environment Variables

Configure in `wrangler.jsonc`:

```json
"vars": {
  "ENVIRONMENT": "production",
  "ORIGIN_URL": "https://api.eddata.dev",
  "ENABLE_METRICS": "false"
}
```

## 🛠️ Installation & Deployment

### Prerequisites

- Cloudflare account (free tier works!)
- Node.js 24+ (for local development)
- Wrangler CLI installed globally

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/EDDataAPI/eddata-cloudflare-worker.git
   cd eddata-cloudflare-worker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure wrangler.jsonc**
   
   Update the account ID:
   ```json
   "account_id": "YOUR_ACCOUNT_ID"
   ```

4. **Test locally**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:8787/health`

5. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```

### Custom Domain (Optional)

Add to `wrangler.jsonc`:
```json
"routes": [
  {
    "pattern": "cache.eddata.dev/*",
    "zone_name": "eddata.dev"
  }
]
```

## 📡 API Endpoints

### Cache Endpoint
```
GET /cache/{filename}
```

**Example:**
```bash
curl https://your-worker.workers.dev/cache/commodity-ticker.json
```

**Response Headers:**
- `X-Cache`: `HIT` or `MISS`
- `X-Cache-Status`: `fresh`, `stale`, `stale-error`, `updated`
- `X-Response-Time`: Response time in milliseconds
- `Age`: Age of cached content in seconds

### Health Check
```
GET /health
```

**Response:**
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

### Metrics (Optional)
```
GET /metrics
```

Enable by setting `ENABLE_METRICS=true` in environment variables.

## 🔍 Monitoring

### Response Headers

Every response includes:
- `X-Cache`: Cache hit/miss status
- `X-Cache-Status`: Detailed cache state
- `X-Response-Time`: Processing time
- `X-Worker-Version`: Worker version

### Cloudflare Dashboard

Monitor in Cloudflare Dashboard:
- **Workers** → Your Worker → **Metrics**
- View requests, errors, CPU time, and duration

## 🏗️ Development

### Project Structure

```
eddata-cloudflare-worker/
├── worker.js           # Main worker code
├── wrangler.jsonc      # Cloudflare configuration
├── wrangler.toml       # Legacy config (optional)
├── package.json        # Dependencies
├── README.md           # This file
├── SETUP_GUIDE.md      # Detailed setup guide
└── LICENSE             # AGPL-3.0 license
```

### Local Development

```bash
# Start development server
npm run dev

# Tail logs from production
npm run tail

# Check authentication
npm run whoami
```

### Testing

Test the worker locally:

```bash
# Health check
curl http://localhost:8787/health

# Cache endpoint
curl http://localhost:8787/cache/commodity-ticker.json

# Check headers
curl -I http://localhost:8787/cache/galnet-news.json
```

## 🚦 Cache Behavior

### Fresh Content (Within TTL)
- Served immediately from edge cache
- No origin request
- `X-Cache-Status: fresh`

### Stale Content (Between TTL and Stale TTL)
- Served immediately from cache
- Background refresh triggered
- `X-Cache-Status: stale`
- `Warning: 110 - "Response is Stale"`

### Expired Content (Beyond Stale TTL)
- Fetches from origin
- Updates cache
- `X-Cache-Status: updated`

### Origin Failure
- Returns stale content if available
- `X-Cache-Status: stale-error`
- `Warning: 111 - "Revalidation Failed"`

### Retry Logic
- 3 retry attempts for 5xx errors and 429 (rate limit)
- Exponential backoff: 100ms, 200ms, 400ms
- Max delay: 1000ms

## 🔒 Security

### Headers Applied

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

### CORS Policy

- Origin: `*` (all origins allowed)
- Methods: `GET`, `HEAD`, `OPTIONS`
- Headers: `Content-Type`, `If-None-Match`, `Accept-Encoding`
- Max Age: 24 hours

## 📈 Performance

### Cloudflare Free Tier Limits

- **Requests**: 100,000/day
- **CPU Time**: 10ms per request
- **Bandwidth**: Unlimited for cached responses
- **Workers**: 30 workers maximum

### Optimization Tips

1. **Cache Hits**: Most requests served from edge (< 5ms)
2. **Stale Serving**: Zero downtime during origin issues
3. **Compression**: Automatic compression for JSON responses
4. **Edge Network**: 300+ data centers worldwide

## 🔗 Related Projects

- [eddata-api](https://github.com/EDDataAPI/eddata-api) - Main API backend
- [eddata-collector](https://github.com/EDDataAPI/eddata-collector) - Data collection service
- [eddata-www](https://github.com/EDDataAPI/eddata-www) - Web frontend
- [eddata-auth](https://github.com/EDDataAPI/eddata-auth) - Authentication service

## � Client Integration

### For Client Applications

Clients (eddata-www, eddata-collector, etc.) can continue using the same API URL:

```javascript
const API_BASE = 'https://api.eddata.dev'
```

**No changes required** - The worker is configured to run on the same domain via Cloudflare Routes. All `/cache/*` requests are automatically handled by the worker, while other requests pass through to the origin server.

### Route Configuration

The worker is configured in `wrangler.jsonc` to handle cache requests:

```json
{
  "routes": [
    {
      "pattern": "api.eddata.dev/cache/*",
      "zone_name": "eddata.dev"
    }
  ]
}
```

This means:
- `api.eddata.dev/cache/*` → Handled by Worker (cached)
- `api.eddata.dev/api/*` → Passes through to origin server
- `api.eddata.dev/*` → Passes through to origin server

### Benefits for Clients

- ✅ **No code changes needed** - Keep using existing API URLs
- ✅ **Automatic caching** - All cache endpoints accelerated
- ✅ **Higher availability** - Stale-while-revalidate keeps data available
- ✅ **Global CDN** - Cloudflare's 300+ edge locations
- ✅ **Automatic retries** - Worker retries failed requests 3x
- ✅ **Transparent** - Clients see same API contract

---

## �📝 License

AGPL-3.0 - See [LICENSE](LICENSE) file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/EDDataAPI/eddata-cloudflare-worker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/EDDataAPI/eddata-api/discussions)
- **Discord**: [EDData Community](https://discord.gg/eddata) *(if available)*

## 🙏 Acknowledgments

- Built for the Elite Dangerous community
- Powered by [Cloudflare Workers](https://workers.cloudflare.com/)
- Part of the EDData ecosystem

---

**Made with ❤️ for the Elite Dangerous community**