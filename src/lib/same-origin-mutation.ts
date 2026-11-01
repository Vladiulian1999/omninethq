// Vercel preserves the public Host even when the handler URL is reconstructed.
// Pin both browser Origin and Host to server configuration, never forwarded
// headers. Missing/invalid configuration fails closed.
export function isSameOriginMutation(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false
  const origin = req.headers.get('origin')
  if (!origin || origin === 'null') return false
  try {
    const configured = process.env.OMNINET_APP_ORIGIN
    if (!configured || configured !== configured.trim()) return false
    const trusted = new URL(configured)
    if (trusted.username || trusted.password || trusted.pathname !== '/'
      || trusted.search || trusted.hash) return false
    const localHttp = trusted.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(trusted.hostname)
      && process.env.NODE_ENV !== 'production'
    if (trusted.protocol !== 'https:' && !localHttp) return false

    const supplied = new URL(origin)
    // Origin must be a serialized origin, not a URL with credentials/path.
    if (origin !== supplied.origin) return false
    const host = req.headers.get('host')
    return supplied.origin === trusted.origin
      && host?.toLowerCase() === trusted.host.toLowerCase()
  } catch {
    return false
  }
}
