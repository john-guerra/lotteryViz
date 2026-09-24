// Request guards for a server that must only ever be driven by the instructor's
// own browser or CLI.
//
// A localhost IP check alone is not enough: when a page on some other site
// makes the instructor's browser send a request here, the request still comes
// from 127.0.0.1. Three things close that gap:
//
// 1. State-changing requests must be application/json. HTML forms can only send
//    urlencoded/multipart/text bodies, and a cross-site fetch() with a JSON
//    body triggers a CORS preflight this server never grants. This is the
//    real CSRF defense.
// 2. Sec-Fetch-Site and a non-null Origin, when the browser sends them, must be
//    same-origin / loopback. Defense in depth for browsers that send them.
//    Origin "null" is allowed: MainPage.js posts with referrerPolicy
//    "no-referrer", which makes browsers send Origin: null even same-origin.
// 3. The Host header must be loopback on every request, which defeats DNS
//    rebinding (evil.example re-pointed at 127.0.0.1) and LAN clients reaching
//    the backend through a proxy.

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

/** True for "localhost", "127.0.0.1" or "[::1]", with or without a port. */
export function isLoopbackHost(host) {
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

function isLoopbackOrigin(origin) {
  try {
    return isLoopbackHost(new URL(origin).host);
  } catch {
    return false;
  }
}

/** The client connected from this machine. */
export function isLocalhost(req) {
  return LOOPBACK_IPS.has(req.ip);
}

/** App-wide middleware: see the header comment for what each check blocks. */
export function sameMachineOnly(req, res, next) {
  if (!isLoopbackHost(req.get("host"))) {
    return res.status(403).json({ error: "Unrecognized Host header." });
  }
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && !ALLOWED_FETCH_SITES.has(fetchSite)) {
    return res.status(403).json({ error: "Cross-site requests are not allowed." });
  }
  const origin = req.get("origin");
  if (origin && origin !== "null" && !isLoopbackOrigin(origin)) {
    return res.status(403).json({ error: "Cross-origin requests are not allowed." });
  }
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "Requests must be application/json." });
  }
  return next();
}

/** Route middleware for endpoints that write data. */
export function localhostOnly(req, res, next) {
  if (isLocalhost(req)) return next();
  return res.status(403).json({ error: "This action is only allowed from localhost." });
}
