# Image search operations

The flip image search is served by `GET /api/image-search?q=...`. It runs in
the web deployment and does not require changes to an Idena shared node. A
desktop build uses its own local adapter; browser clients such as
`app.idena.io` require this API route to be deployed with the web application.

## Runtime and secrets

- Build and run with Node.js `24.18.0` and npm `11.16.0`.
- No provider credential is required. DuckDuckGo, Openverse, and Wikimedia are
  queried through public HTTPS endpoints.
- Do not add provider keys to `NEXT_PUBLIC_*` variables. Those variables are
  delivered to every browser.
- Keep the deployment's normal node and database credentials separate from
  this endpoint. Image-search failures must not include configuration values or
  upstream response bodies in the public response.

## Release check

From a clean checkout:

```bash
npm ci
npm audit --audit-level=moderate
npm audit signatures
npm run audit:compatibility
npm run audit:privacy
npm run lint
npm test -- --runInBand
npm run test:image-search:live
npm run build
```

Deploy the resulting commit through the normal web deployment. For Vercel,
select Node.js 24 and leave the build command as `npm run build`.

The endpoint trusts forwarding headers automatically on Vercel. A self-hosted
deployment uses the direct socket address unless
`IMAGE_SEARCH_TRUST_PROXY=1` is set. Only enable that setting behind a reverse
proxy that removes client-supplied forwarding headers and writes its own.

Set `IMAGE_SEARCH_DISABLED_SOURCES` to a comma-separated provider list when a
hosting network blocks a source. For example, Hetzner currently requires:

```bash
IMAGE_SEARCH_DISABLED_SOURCES=openverse
```

## Smoke test

Test the preview deployment before promoting it:

```bash
base_url=${BASE_URL:?Set BASE_URL to the preview deployment URL}

curl --fail --silent --show-error \
  "$base_url/api/image-search?q=red%20fox" \
  | node -e '
    let body = ""
    process.stdin.on("data", chunk => { body += chunk })
    process.stdin.on("end", () => {
      const rows = JSON.parse(body)
      if (!Array.isArray(rows) || rows.length === 0) process.exit(1)
      if (!rows.every(row =>
        row.image?.startsWith("https://") &&
        row.thumbnail?.startsWith("https://")
      )) process.exit(1)
      console.log(`validated ${rows.length} image results`)
    })'

test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -X POST "$base_url/api/image-search?q=fox")" = 405
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$base_url/api/image-search?q=")" = 400
```

Also complete a disposable flip workflow in the browser: search, select a
thumbnail, edit it, and discard the flip. Do not use a valuable identity for a
first deployment test.

## Abuse controls

The route bounds query length, upstream response size, result count, cache
size, source timeouts, and requests per client. Its in-process rate limiter is
only a backstop: serverless instances do not share memory. Configure a
platform or reverse-proxy rule for `/api/image-search`, and make sure the proxy
overwrites `X-Forwarded-For` rather than accepting a client-supplied value.

Openverse currently permits anonymous searches but applies provider-level
limits. The route caches successful responses for five minutes and continues
with the other providers when one source is unavailable. A provider enters a
five-minute cooldown after two consecutive failures, preventing a blocked
source from being retried for every new query.

Search results remain third-party content. The API returns only CORS-enabled
thumbnail URLs hosted by the reviewed provider proxies, rather than arbitrary
source-site URLs. Loading a result still reveals the browser's network address
and request metadata to that provider host, and provider-side moderation is
not a security boundary. Treat every returned image as untrusted input.

## Recovery

If image search fails after deployment:

1. Check the deployment logs for the failing provider name. Logs intentionally
   omit the query, credentials, and upstream body.
2. Confirm that outbound HTTPS to DuckDuckGo, Openverse, and Wikimedia is
   permitted.
3. Run the smoke test against the previous deployment.
4. Roll back to that deployment if the previous version succeeds.

Do not replace the generic `502` response with raw provider errors; they are
not a stable public contract and may expose operational detail.
