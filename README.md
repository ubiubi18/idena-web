# Idena Web

Browser-based Idena wallet and validation client built with Next.js and React.

[![Build and test](https://github.com/ubiubi18/idena-web/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/ubiubi18/idena-web/actions/workflows/build.yml)

> This is a community-maintained source fork. It has no published release and
> this repository does not claim that any public Idena website is running this
> revision. Review and build it locally before connecting a valuable identity.

## Fork status

This client uses existing Idena RPC, indexer, and marketplace interfaces. It
does not implement blockchain consensus. Compatibility therefore depends on
the configured services continuing to expose the expected APIs and on the
browser receiving valid data from them.

### What was updated

- The development stack now targets Node `24.18.0`, npm `11.16.0`, Next.js
  `16.2`, and React `18.3` with a reproducible npm lockfile.
- Native and obsolete browser cryptography dependencies were replaced with
  maintained Noble implementations and local, tested VRF logic.
- The vulnerable legacy image editor and drag-and-drop package were replaced,
  and DuckDuckGo image search was restored through a normalized server-side
  adapter with URL filtering and regression tests.
- Server-side DNA endpoints require HTTPS, reject embedded credentials and
  private/local destinations, disable redirects, and revalidate DNS results to
  reduce SSRF and DNS-rebinding exposure.
- Connection metadata and sensitive persisted values are handled separately;
  logging and public API errors are redacted and bounded.
- CI uses pinned actions and runs dependency/signature audits, privacy checks,
  lint, tests, and a production build.

### Benefits

- Fewer native modules and known vulnerable transitive dependencies.
- Better protection around external URLs, remote node endpoints, image search,
  browser persistence, and diagnostic output.
- A current and repeatable build path with broader regression coverage.

### Risks and tradeoffs

- A browser wallet inherits the security of the browser, extensions, host
  device, configured node, indexer, marketplace, and every external service it
  contacts. The application cannot make an untrusted endpoint safe.
- Every `NEXT_PUBLIC_*` value is included in browser-delivered JavaScript. In
  particular, `NEXT_PUBLIC_RESTRICTED_NODE_KEY` must be a low-privilege,
  rate-limited key that is safe to disclose. Never place an unrestricted node
  key or private secret in a public environment variable.
- Framework and cryptography upgrades may expose browser-specific regressions
  even when tests pass. Verify signing, recovery, and validation flows with a
  disposable identity first.
- Image and marketplace providers can change behavior or block automated
  requests. DuckDuckGo image search is tested but is not a guaranteed API.
- Browser storage is not a hardware wallet. Clear site data and revoke node
  credentials after testing on a shared or untrusted machine.

## Development

Requirements:

- Node.js `24.18.0` on the Node 24 LTS line
- npm `11.16.0`
- Git

Install and validate:

```bash
npm ci
npm run audit:compatibility
npm run audit:privacy
npm run lint
npm test -- --runInBand
npm run build
```

`compatibility/stack-lock.json` pins the reviewed legacy-compatible node set.
The compatibility audit fails if the mainnet network ID, gossip protocol,
embedded resource digests, consensus policy, or expected node commit changes.
This client does not implement consensus and the lock remains a release
candidate until every differential gate named in it has passed.

Start the development server:

```bash
npm run dev
```

Only define the remote services required for the workflow being tested. Keep
local secrets in an untracked environment file, and remember that variables
prefixed with `NEXT_PUBLIC_` are intentionally public.

## Deployment

Run `npm run build` in the same environment used for deployment and supply
production service URLs through the deployment platform. Do not deploy from a
dirty worktree, do not reuse development node keys, and run the privacy audit
against the exact commit being deployed.
