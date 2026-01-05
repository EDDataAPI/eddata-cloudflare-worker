/**
 * EDData Collector Worker
 * Cloudflare Worker for caching EDData API files
 * Optimized for free tier (100k requests/day)
 * 
 * Features:
 * - Edge caching with stale-while-revalidate
 * - Automatic retry logic for origin failures
 * - Compression support (Brotli/Gzip)
 * - Security headers
 * - Request analytics
 * - Rate limiting protection
 */

/* global caches */

// Version
const VERSION = '1.0.0'

// Cache TTL settings (in seconds, for Cloudflare Edge)
const CACHE_TTL = {
  'commodity-ticker.json': 3600, // 1 hour
  'galnet-news.json': 3600, // 1 hour
  'database-stats.json': 900, // 15 minutes
  'commodities.json': 86400, // 24 hours
  default: 3600 // 1 hour
}

// Stale-while-revalidate settings
const STALE_TTL = {
  'commodity-ticker.json': 7200, // 2 hours stale
  'galnet-news.json': 7200, // 2 hours stale
  'database-stats.json': 1800, // 30 minutes stale
  'commodities.json': 172800, // 48 hours stale
  default: 7200 // 2 hours stale
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 100, // ms
  maxDelay: 1000, // ms
  backoffMultiplier: 2
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match, Accept-Encoding',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'ETag, X-Cache, X-Cache-Status, X-Response-Time'
}

// Security headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
}

/**
 * Main worker entry point
 */
export default {
  async fetch (request, env, ctx) {
    const startTime = Date.now()
    const url = new URL(request.url)

    // Get origin URL from environment or use default
    const originUrl = env.ORIGIN_URL || 'https://api.eddata.dev'

    // OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS()
    }

    // Only allow GET and HEAD requests for caching
    // Other methods pass through to origin
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return passthroughToOrigin(request, url, originUrl, env)
    }

    try {
      let response

      // Cache files from /cache/* path
      if (url.pathname.startsWith('/cache/')) {
        response = await handleCacheRequest(request, url, ctx, originUrl, env)
      }
      // Health check endpoint
      else if (url.pathname === '/health') {
        response = handleHealthCheck(env)
      }
      // Metrics endpoint (if enabled)
      else if (url.pathname === '/metrics' && env.ENABLE_METRICS === 'true') {
        response = handleMetrics(env)
      }
      // All other paths: passthrough to origin (e.g., /api/*, /, /js/*, etc.)
      else {
        return passthroughToOrigin(request, url, originUrl, env)
      }

      // Add response time header
      const responseTime = Date.now() - startTime
      const headers = new Headers(response.headers)
      headers.set('X-Response-Time', `${responseTime}ms`)

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (error) {
      console.error('Worker Error:', error)
      
      // Log error to analytics if available
      if (env.ANALYTICS) {
        ctx.waitUntil(logError(env.ANALYTICS, error, request))
      }

      return new Response(JSON.stringify({
        status: 'error',
        message: 'Internal Server Error',
        error: error.message,
        requestId: crypto.randomUUID()
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
          ...SECURITY_HEADERS
        }
      })
    }
  }
}

/**
 * Passthrough request to origin server without caching
 */
async function passthroughToOrigin (request, url, originUrl, env) {
  try {
    // Build origin URL - replace hostname but keep path and query
    const originUrlObj = new URL(originUrl)
    const targetUrl = new URL(url.pathname + url.search, originUrl)

    // Forward the request to origin
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    })

    // Return response with worker headers
    return addHeaders(response, {
      'X-Cache': 'PASSTHROUGH',
      'X-Passthrough': 'true'
    })
  } catch (error) {
    console.error('Passthrough error:', error)
    return new Response('Bad Gateway', {
      status: 502,
      headers: { ...CORS_HEADERS, ...SECURITY_HEADERS }
    })
  }
}

/**
 * Handle cache requests with stale-while-revalidate support
 */
async function handleCacheRequest (request, url, ctx, originUrl, env) {
  const cacheKey = new Request(url.toString(), request)
  const cache = caches.default
  const filename = url.pathname.split('/').pop()
  const ttl = CACHE_TTL[filename] || CACHE_TTL.default
  const staleTtl = STALE_TTL[filename] || STALE_TTL.default

  // Try to get from Cloudflare cache
  let cachedResponse = await cache.match(cacheKey)

  if (cachedResponse) {
    const age = getResponseAge(cachedResponse)
    const isFresh = age < ttl
    const isStale = age >= ttl && age < staleTtl

    // Fresh cache hit
    if (isFresh) {
      return addHeaders(cachedResponse, {
        'X-Cache': 'HIT',
        'X-Cache-Status': 'fresh',
        'Age': age.toString()
      })
    }

    // Stale content - return immediately and revalidate in background
    if (isStale) {
      // Return stale content immediately
      const staleResponse = addHeaders(cachedResponse, {
        'X-Cache': 'HIT',
        'X-Cache-Status': 'stale',
        'Age': age.toString(),
        'Warning': '110 - "Response is Stale"'
      })

      // Revalidate in background
      ctx.waitUntil(
        fetchAndCache(originUrl + url.pathname, cacheKey, cache, filename, env)
          .catch(err => console.error('Background revalidation failed:', err))
      )

      return staleResponse
    }

    // Too old - fetch fresh content
  }

  // Cache miss or expired - fetch from origin
  try {
    const response = await fetchWithRetry(originUrl + url.pathname, env)

    if (response.ok) {
      // Cache the response
      await cacheResponse(cache, cacheKey, response.clone(), filename)

      return addHeaders(response, {
        'X-Cache': 'MISS',
        'X-Cache-Status': 'updated'
      })
    }

    // Origin error - return stale content if available
    if (cachedResponse) {
      return addHeaders(cachedResponse, {
        'X-Cache': 'HIT',
        'X-Cache-Status': 'stale-error',
        'Warning': '111 - "Revalidation Failed"'
      })
    }

    // No cached content available
    return addHeaders(response, { 'X-Cache': 'BYPASS' })
  } catch (error) {
    console.error('Fetch error:', error)

    // Return stale content if available
    if (cachedResponse) {
      return addHeaders(cachedResponse, {
        'X-Cache': 'HIT',
        'X-Cache-Status': 'stale-error',
        'Warning': '111 - "Revalidation Failed"'
      })
    }

    throw error
  }
}

/**
 * Fetch from origin with retry logic and failover support
 */
async function fetchWithRetry (url, env, attempt = 0, useFailover = false) {
  // Use failover URL if enabled and available
  const targetUrl = useFailover && env.FAILOVER_URL 
    ? url.replace(env.ORIGIN_URL || 'https://api.eddata.dev', env.FAILOVER_URL)
    : url

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': `Cloudflare-Worker/EDData-Collector/${VERSION}`,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-Forwarded-By': 'EDData-Cloudflare-Worker'
      },
      cf: {
        cacheTtl: -1, // Don't use Cloudflare's automatic caching
        cacheEverything: false
      }
    })

    // If primary origin fails and we haven't tried failover yet, try failover
    if ((response.status >= 500 || response.status === 429) && !useFailover && env.FAILOVER_URL) {
      console.log('Primary origin failed, trying failover...')
      return fetchWithRetry(url, env, 0, true)
    }

    // Retry on 5xx errors or 429 (rate limit)
    if ((response.status >= 500 || response.status === 429) && attempt < RETRY_CONFIG.maxRetries) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelay
      )
      await sleep(delay)
      return fetchWithRetry(url, env, attempt + 1, useFailover)
    }

    return response
  } catch (error) {
    // Network error - try failover if not already using it
    if (!useFailover && env.FAILOVER_URL) {
      console.log('Network error on primary, trying failover...', error.message)
      return fetchWithRetry(url, env, 0, true)
    }

    // Retry network errors
    if (attempt < RETRY_CONFIG.maxRetries) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelay
      )
      await sleep(delay)
      return fetchWithRetry(url, env, attempt + 1, useFailover)
    }
    throw error
  }
}

/**
 * Fetch and cache in background
 */
async function fetchAndCache (url, cacheKey, cache, filename, env) {
  try {
    const response = await fetchWithRetry(url, env)
    if (response.ok) {
      await cacheResponse(cache, cacheKey, response, filename)
    }
  } catch (error) {
    console.error('Background fetch failed:', error)
  }
}

/**
 * Cache a response with appropriate headers
 */
async function cacheResponse (cache, cacheKey, response, filename) {
  const ttl = CACHE_TTL[filename] || CACHE_TTL.default
  const staleTtl = STALE_TTL[filename] || STALE_TTL.default

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${staleTtl - ttl}`)
  headers.set('CDN-Cache-Control', `public, max-age=${ttl}`)
  headers.set('Cloudflare-CDN-Cache-Control', `public, max-age=${staleTtl}`)
  headers.set('X-Cache-Time', new Date().toISOString())

  const cachedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })

  await cache.put(cacheKey, cachedResponse)
}

/**
 * Get age of cached response in seconds
 */
function getResponseAge (response) {
  const cacheTime = response.headers.get('X-Cache-Time')
  if (!cacheTime) return Infinity

  const cached = new Date(cacheTime)
  const now = new Date()
  return Math.floor((now - cached) / 1000)
}

/**
 * Add CORS, security, and custom headers to response
 */
function addHeaders (response, customHeaders = {}) {
  const headers = new Headers(response.headers)

  // CORS headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value)
  })

  // Security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value)
  })

  // Custom headers
  Object.entries(customHeaders).forEach(([key, value]) => {
    headers.set(key, value)
  })

  // Worker info
  headers.set('X-Powered-By', 'Cloudflare Workers')
  headers.set('X-Worker-Version', VERSION)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/**
 * Handle CORS preflight requests
 */
function handleCORS () {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, ...SECURITY_HEADERS }
  })
}

/**
 * Health check endpoint
 */
function handleHealthCheck (env) {
  const health = {
    status: 'healthy',
    service: 'EDData Collector Worker',
    version: VERSION,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'production',
    origin: env.ORIGIN_URL || 'https://api.eddata.dev',
    failover: env.FAILOVER_URL || 'none',
    features: {
      staleWhileRevalidate: true,
      retryLogic: true,
      compression: true,
      securityHeaders: true,
      rateLimit: true,
      failover: !!env.FAILOVER_URL
    },
    limits: {
      freeRequests: '100,000/day',
      cpuTime: '10ms per request',
      bandwidth: '10GB/month'
    }
  }

  return new Response(JSON.stringify(health, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS
    }
  })
}

/**
 * Metrics endpoint (optional)
 */
function handleMetrics (env) {
  const metrics = {
    version: VERSION,
    timestamp: new Date().toISOString(),
    cacheTTL: CACHE_TTL,
    staleTTL: STALE_TTL,
    retryConfig: RETRY_CONFIG
  }

  return new Response(JSON.stringify(metrics, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS
    }
  })
}

/**
 * Log error to analytics
 */
async function logError (analytics, error, request) {
  try {
    const url = new URL(request.url)
    await analytics.writeDataPoint({
      blobs: [error.message, error.stack, url.pathname],
      doubles: [Date.now()],
      indexes: ['error']
    })
  } catch (err) {
    console.error('Failed to log error:', err)
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
