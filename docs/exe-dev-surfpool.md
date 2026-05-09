# exe.dev Surfpool bootstrap

This repo has a bootstrap script for the Surfpool-only deployment:

```bash
npm run bootstrap:exe-surfpool
```

The script prepares the VM, starts Surfpool on port `8898`, deploys the required programs, and seeds the Diet Coke demo pool.

## What it deploys

- `taste_protocol`: `FdxAfXgWTddXjDFL3TSt7wYEv19AM5h6e4ntHBjmzKbt`
- `taste_scan_claim`: `9KrqHV2a2YqUaDkEP3jJ6zYxoyMNQgPaeskQxuWRuNy`
- Metaplex Token Metadata: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`

## Ports

- Surfpool RPC: `8898`
- Surfpool WebSocket: `8899`
- Surfpool Studio: `18488`

On exe.dev, share port `8898` for the RPC endpoint.

## Outputs

The bootstrap writes:

- `.exe/runtime.env`: RPC values for the app
- `.tmp/tastenet-demo-seed.json`: deployed demo account addresses
- `.exe/logs/surfpool.log`: Surfpool logs

## Important env vars

```bash
SURFPOOL_RPC_PORT=8898
SURFPOOL_WS_PORT=8899
SURFPOOL_STUDIO_PORT=18488
TASTE_CORE_REPO_URL=https://github.com/makrozoia-space/taste-core.git
TASTE_CORE_REF=main
```

The bootstrap clones `taste-core` because this focused demo repo only contains the direct scan-claim program. The Taste Protocol binary and IDL come from `taste-core`.
