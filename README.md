# Taste Colosseum Demo 1

Standalone `taste.fun` scan-claim demo.

This repo contains:

- a React app where scanning the seeded Diet Coke batch unlocks a direct `$TASTE` claim
- the separate `taste_scan_claim` Solana program used for that payout flow
- the generated IDL and TypeScript client used by the app

## What the demo does

- no market is opened
- a matching batch scan points to a brand-funded payout pool
- one wallet can claim once
- the pool pays a fixed `$TASTE` amount
- all records are linkable to Solana Explorer through a custom RPC URL

## Run the app

```bash
npm install
cp .env.example .env
npm run dev
```

Open the app at `http://127.0.0.1:5173`.

## Networks

- `Solana Localnet` defaults to `http://127.0.0.1:8899`
- `TasteNet` defaults to `http://127.0.0.1:8898`

The `Airdrop` button only works against a local TasteNet RPC because the dev server exposes a local funding route at `/__tastenet/fund-wallet`.

## Program source

The direct payout contract is in:

- `programs/taste_scan_claim/src/lib.rs`

It is intentionally separate from the main claim-market program.
