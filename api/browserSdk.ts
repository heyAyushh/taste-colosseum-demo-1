import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";

export const TASTE_PROTOCOL_PROGRAM_ID = new PublicKey(
  "FdxAfXgWTddXjDFL3TSt7wYEv19AM5h6e4ntHBjmzKbt",
);

export const TASTE_SCAN_CLAIM_PROGRAM_ID = new PublicKey(
  "9KrqHV2a2YqUaDkEP3jJ6zYxoyMNQgPaeskQxuWRuNy",
);

export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const CONFIG_SEED = "config";
const BRAND_SEED = "brand";
const PRODUCT_SEED = "product";
const LOT_SEED = "lot";
const DEMO_SCAN_POOL_SEED = "demo-scan-pool";
const DEMO_SCAN_CLAIM_RECEIPT_SEED = "demo-scan-claim";
const textEncoder = new TextEncoder();

export type SeedValue = BN | number | string;

export function deriveConfig(programId = TASTE_PROTOCOL_PROGRAM_ID): PublicKey {
  return findProgramAddress([seedBytes(CONFIG_SEED)], programId);
}

export function deriveBrand(
  brandId: SeedValue,
  programId = TASTE_PROTOCOL_PROGRAM_ID,
): PublicKey {
  return findProgramAddress([seedBytes(BRAND_SEED), u64Seed(brandId)], programId);
}

export function deriveProduct(
  productId: SeedValue,
  programId = TASTE_PROTOCOL_PROGRAM_ID,
): PublicKey {
  return findProgramAddress([seedBytes(PRODUCT_SEED), u64Seed(productId)], programId);
}

export function deriveLot(
  product: PublicKey,
  lotId: SeedValue,
  programId = TASTE_PROTOCOL_PROGRAM_ID,
): PublicKey {
  return findProgramAddress([seedBytes(LOT_SEED), product.toBytes(), u64Seed(lotId)], programId);
}

export function deriveDemoScanPool(
  product: PublicKey,
  lot: PublicKey,
  programId = TASTE_SCAN_CLAIM_PROGRAM_ID,
): PublicKey {
  return findProgramAddress(
    [seedBytes(DEMO_SCAN_POOL_SEED), product.toBytes(), lot.toBytes()],
    programId,
  );
}

export function deriveDemoScanClaimReceipt(
  demoScanPool: PublicKey,
  scanner: PublicKey,
  programId = TASTE_SCAN_CLAIM_PROGRAM_ID,
): PublicKey {
  return findProgramAddress(
    [seedBytes(DEMO_SCAN_CLAIM_RECEIPT_SEED), demoScanPool.toBytes(), scanner.toBytes()],
    programId,
  );
}

export function solanaExplorerAddressUrl(
  address: PublicKey | string,
  cluster: "localnet" | "devnet" | "testnet" | "mainnet-beta" = "localnet",
  customRpcUrl = "http://127.0.0.1:8898",
  explorerBaseUrl = "https://explorer.solana.com",
): string {
  const addressText = typeof address === "string" ? address : address.toBase58();
  const normalizedBaseUrl = explorerBaseUrl.replace(/\/+$/, "");
  if (cluster === "localnet") {
    return `${normalizedBaseUrl}/address/${addressText}?cluster=custom&customUrl=${encodeURIComponent(customRpcUrl)}`;
  }
  return `${normalizedBaseUrl}/address/${addressText}?cluster=${cluster}`;
}

function findProgramAddress(seeds: Uint8Array[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function u64Seed(value: SeedValue): Uint8Array {
  let nextValue = BigInt(toBN(value).toString());
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(nextValue & 0xffn);
    nextValue >>= 8n;
  }
  return bytes;
}

function toBN(value: SeedValue): BN {
  return BN.isBN(value) ? value : new BN(value);
}

function seedBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}
