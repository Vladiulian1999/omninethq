# Trusted application origin

Set the server environment variable `OMNINET_APP_ORIGIN` in Vercel before
deploying these routes. For the existing canonical production domain use:

```
OMNINET_APP_ORIGIN=https://omninethq.co.uk
```

This is an origin only: no credentials, path, query or fragment. If the canonical
domain is different, set its exact HTTPS origin instead. Set each Preview/Staging
deployment to its own exact public HTTPS origin, not the production value.
Aliases such as www and alternative preview URLs are intentionally rejected;
redirect visitors to the configured canonical origin before they use the app.

For local development only, `http://localhost:3000` is supported. Public HTTP
origins and production HTTP origins are rejected. Missing/invalid configuration
fails closed with 403 for authenticated writes.

The browser Origin and request Host must both match this configuration, including
non-default ports. Vercel must preserve the public Host; an upstream proxy must
preserve it as well. The handler's reconstructed request URL can be internal.
X-Forwarded-Host and X-Forwarded-Proto never authorise a request. Verify this
through the real staging domain before production rollout. Do not replace Host
validation with unchecked forwarded headers to accommodate a different proxy.

Configuration applies to offer creation and owner tag deletion. No credentials
are stored here. The environment setting and deployment were not performed.
