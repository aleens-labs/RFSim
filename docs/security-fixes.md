# RFSim Security Fixes

Audit artifact date: 2026-05-07
Implementation update: 2026-05-08
Target reviewed: https://www.rfsim.us

## Fixed

### Self-registration admin escalation

Observed: the previous registration flow could grant admin privileges from hardcoded bootstrap identity matching.

Fix:
- Self-registration always creates non-admin users.
- Server AI key management now relies on the database `is_admin` flag, not a hardcoded username.
- Admin-only error messages no longer disclose a specific administrator username.

Validation:
- Unit tests cover self-registration policy and server AI key manager checks.

### Server-wide AI key exposure

Observed: server-wide fallback AI config could be serialized to the browser with the raw provider key.

Fix:
- Server-wide AI config sent to clients now contains metadata and `hasApiKey`, never `apiKey`.
- Anthropic server-wide key usage is relayed through authenticated backend endpoint `/api/ai/anthropic/messages`.
- Client code uses the backend relay when a server-managed Anthropic config is selected.

Validation:
- Unit test verifies the server-wide AI config payload never contains `apiKey`.

### TAK connector SSRF guard

Observed: authenticated users can configure backend-side TAK socket targets.

Fix:
- Production blocks direct TAK connections to localhost, private, link-local, reserved, and multicast IP targets by default.
- `TAK_ALLOW_UNSAFE_HOSTS=true` is available only for deployments that intentionally need trusted private TAK hosts.

Validation:
- Unit tests cover blocked unsafe TAK targets and explicit override behavior.

### SPA fallback for sensitive paths

Observed: paths such as `/certs/proxy.key` returned the SPA HTML fallback, creating noisy scan results and weak server-side control.

Fix:
- Nginx explicitly returns 404 for `/certs`, `/certs/*`, dotfiles, and secret-looking file names such as `.env`, `.key`, `.crt`, `.pem`, `.p12`, and `.pfx`.

Validation:
- Nginx config is covered by review and should be confirmed after deployment with:
  `curl -I https://www.rfsim.us/certs/proxy.key`

### Public default Cesium token

Observed: the live `app-config.js` contained a Cesium Ion token.

Fix:
- Docker web startup no longer writes `CESIUM_ION_DEFAULT_TOKEN` into public `app-config.js`.
- Users should enter Cesium tokens through the UI instead.

Operational follow-up:
- Rotate or restrict any Cesium token that was previously published.

### Response hardening headers

Fix:
- Nginx adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a focused CSP for anti-framing/object/base-uri controls.
- Nginx hides `X-Powered-By` from proxied responses.

## Deferred

### JWT storage migration

Current behavior stores the JWT in browser storage. This is not a standalone vulnerability without XSS, but an XSS chain would increase impact.

Recommended next step:
- Move authenticated sessions to `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Add CSRF protection for state-changing routes if cookie auth is adopted.

### Full CSP enforcement

The app uses external map, terrain, CDN, and AI endpoints. A broad CSP should be introduced only after browser validation so it does not break Leaflet, Cesium, workers, or configured provider flows.

Recommended next step:
- Start with `Content-Security-Policy-Report-Only`.
- Promote to enforcing CSP after the report stream is clean.

### DNS-resolved TAK host filtering

The TAK SSRF guard blocks unsafe IP literals. DNS names that resolve to private addresses should be handled with an allowlist or DNS resolution guard if this becomes an Internet-facing multi-tenant deployment.
