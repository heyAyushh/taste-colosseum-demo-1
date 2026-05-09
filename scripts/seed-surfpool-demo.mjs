import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../api/taste_protocol.idl.json" with { type: "json" };
import scanClaimIdl from "../api/taste_scan_claim.idl.json" with { type: "json" };

const RPC_URL = process.env.TASTENET_RPC_URL ?? process.env.SURFPOOL_RPC_URL ?? "http://127.0.0.1:8898";
const WS_URL = process.env.TASTENET_WS_URL ?? process.env.SURFPOOL_WS_URL ?? "ws://127.0.0.1:8897";
const STUDIO_URL = process.env.TASTENET_STUDIO_URL ?? "http://127.0.0.1:18488";
const WALLET_PATH = expandHome(process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json");
const PROGRAM_ID = new PublicKey("FdxAfXgWTddXjDFL3TSt7wYEv19AM5h6e4ntHBjmzKbt");
const SCAN_CLAIM_PROGRAM_ID = new PublicKey("9KrqHV2a2YqUaDkEP3jJ6zYxoyMNQgPaeskQxuWRuNy");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TASTE_PLUS_PER_CLAIM_CAP = 500;
const TASTE_PLUS_PER_WALLET_CAP = 500;
const TASTE_PLUS_DEPOSIT = 5_000;
const DEMO_SCAN_POOL_REWARD_AMOUNT = 250;
const DEMO_SCAN_POOL_MAX_CLAIMS = 20;
const DEMO_SCAN_POOL_DEPOSIT = DEMO_SCAN_POOL_REWARD_AMOUNT * DEMO_SCAN_POOL_MAX_CLAIMS;
const LAB_MIN_STAKE_AMOUNT = 2_500;
const LAB_STAKE_DEPOSIT = 10_000;
const MINT_SUFFIX_LENGTH = 8;
const SOLANA_BIN_DIR = process.env.SOLANA_BIN_DIR ?? join(homedir(), ".local", "share", "solana", "install", "active_release", "bin");
const LOCAL_RPC_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const MAINNET_MARKERS = ["mainnet", "api.mainnet-beta.solana.com"];
const DEMO = {
  brandName: "Diet Coke",
  productName: "Diet Coke 330ml",
  manufacturerName: "Coca-Cola India Bottling",
  lotName: "DC-0426-BAD-QC",
  labelName: "Diet Coke front label",
  claimName: "Lab tested Diet Coke batch is safe",
  labName: "Mumbai Beverage QC Lab",
  brandId: 1886,
  brandHash: 18_860,
  productId: 330,
  productHash: 33_010,
  makerId: 42,
  identityHash: 42_007,
  lotId: 2_026_050_2,
  lotHash: 42_612_026,
  snapshotId: 2_026_050_201,
  labelHash: 18_801,
  barcodeHash: 18_804,
  ocrHash: 18_805,
  packageClaimsHash: 18_806,
  claimId: 101,
  claimKind: 1,
  claimTextHash: 18_802,
  testSpecHash: 18_803,
  evidenceTtlSlots: 250_000,
  labId: 701,
  labPolicyId: 801,
  labCapabilityMask: 0b111,
  oracleHash: 70_001,
  accreditationHash: 70_002,
  regionHash: 70_003,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outputPath = join(repoRoot, ".tmp", "tastenet-demo-seed.json");
mkdirSync(dirname(outputPath), { recursive: true });

assertLocalSeedRpc(RPC_URL);

const admin = readKeypair(WALLET_PATH);
const connection = new anchor.web3.Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: WS_URL,
});
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
  commitment: "confirmed",
});
anchor.setProvider(provider);
const program = new anchor.Program(idl, provider);
const scanClaimProgram = new anchor.Program(scanClaimIdl, provider);

const addresses = {
  config: derivePda(["config"]),
  brand: derivePda(["brand", u64Seed(DEMO.brandId)]),
  manufacturer: derivePda(["manufacturer", u64Seed(DEMO.makerId)]),
  product: derivePda(["product", u64Seed(DEMO.productId)]),
};
addresses.lot = derivePda(["lot", addresses.product.toBuffer(), u64Seed(DEMO.lotId)]);
addresses.labelSnapshot = derivePda([
  "label-snapshot",
  addresses.lot.toBuffer(),
  u64Seed(DEMO.snapshotId),
]);
addresses.demoScanPool = derivePda([
  "demo-scan-pool",
  addresses.product.toBuffer(),
  addresses.lot.toBuffer(),
], SCAN_CLAIM_PROGRAM_ID);
addresses.claim = derivePda(["claim", addresses.lot.toBuffer(), u64Seed(DEMO.claimId)]);
addresses.labOracle = derivePda(["lab-oracle", admin.publicKey.toBuffer()]);
addresses.lab = derivePda(["lab", u64Seed(DEMO.labId)]);
addresses.labStake = derivePda(["lab-stake", addresses.lab.toBuffer()]);
addresses.labSelectionPolicy = derivePda(["lab-selection-policy", u64Seed(DEMO.labPolicyId)]);
let tasteMint = seededKeypair("taste-token-mint-v1");
let demoScanRewardVault = seededKeypair("scan2-demo-reward-vault");
let labStakeVault = seededKeypair("diet-coke-lab-stake-vault-v1");
let labStakerTokenAccount = seededKeypair("diet-coke-lab-staker-token-v1");
const coverageMint = seededKeypair("diet-coke-coverage-mint-v1");
const coverageTokenVault = seededKeypair("diet-coke-coverage-vault-v1");
const brandTokenAccount = seededKeypair("diet-coke-brand-token-v1");
addresses.tasteMint = tasteMint.publicKey;
addresses.demoScanRewardVault = demoScanRewardVault.publicKey;
addresses.labStakeVault = labStakeVault.publicKey;
addresses.labStakerTokenAccount = labStakerTokenAccount.publicKey;
addresses.coverageMint = coverageMint.publicKey;
addresses.coverageTokenVault = coverageTokenVault.publicKey;
addresses.brandTokenAccount = brandTokenAccount.publicKey;
addresses.tastePlusVault = derivePda([
  "taste-plus-vault",
  addresses.brand.toBuffer(),
  addresses.coverageMint.toBuffer(),
]);
addresses.tastePlusProductCoverage = derivePda([
  "taste-plus-product",
  addresses.tastePlusVault.toBuffer(),
  addresses.product.toBuffer(),
]);

await ensureProgramDeployed();
await ensureAirdrop(admin.publicKey);
await resolveRewardMint();
await ensureRewardMint();

await maybeSend("initialize_protocol", addresses.config, () =>
  program.methods
    .initializeProtocol(admin.publicKey, new BN(1_000), new BN(600))
    .accountsStrict({
      admin: admin.publicKey,
      rewardMint: addresses.tasteMint,
      config: addresses.config,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_brand", addresses.brand, () =>
  program.methods
    .registerBrand(new BN(DEMO.brandId), new BN(DEMO.brandHash), admin.publicKey)
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      brandAuthorityIdentity: admin.publicKey,
      brand: addresses.brand,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_manufacturer", addresses.manufacturer, () =>
  program.methods
    .registerManufacturer(new BN(DEMO.makerId), new BN(DEMO.identityHash))
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      manufacturer: addresses.manufacturer,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_branded_product", addresses.product, () =>
  program.methods
    .registerBrandedProduct(new BN(DEMO.productId), new BN(DEMO.productHash))
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      brand: addresses.brand,
      product: addresses.product,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_lot", addresses.lot, () =>
  program.methods
    .registerLot(new BN(DEMO.lotId), new BN(DEMO.lotHash), new BN(999_999_999), false)
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      product: addresses.product,
      manufacturer: addresses.manufacturer,
      lot: addresses.lot,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("record_label_snapshot", addresses.labelSnapshot, () =>
  program.methods
    .recordLabelSnapshot(
      new BN(DEMO.snapshotId),
      new BN(DEMO.labelHash),
      new BN(DEMO.barcodeHash),
      new BN(DEMO.ocrHash),
      new BN(DEMO.packageClaimsHash),
    )
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      product: addresses.product,
      lot: addresses.lot,
      labelSnapshot: addresses.labelSnapshot,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_claim", addresses.claim, () =>
  program.methods
    .registerClaim(
      new BN(DEMO.claimId),
      new BN(DEMO.claimKind),
      new BN(DEMO.labelHash),
      new BN(DEMO.claimTextHash),
      new BN(DEMO.testSpecHash),
      new BN(DEMO.evidenceTtlSlots),
    )
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      product: addresses.product,
      lot: addresses.lot,
      labelSnapshot: addresses.labelSnapshot,
      claim: addresses.claim,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await ensureTokenAccount(
  addresses.tasteMint,
  demoScanRewardVault,
  addresses.demoScanPool,
  "diet-coke-demo-scan-reward-vault",
);
await ensureDemoScanPoolDeposit();
await maybeSend("open_demo_scan_pool", addresses.demoScanPool, () =>
  scanClaimProgram.methods
    .openDemoScanPool(new BN(DEMO_SCAN_POOL_REWARD_AMOUNT), new BN(DEMO_SCAN_POOL_MAX_CLAIMS))
    .accountsStrict({
      brandAuthority: admin.publicKey,
      protocolConfig: addresses.config,
      brand: addresses.brand,
      product: addresses.product,
      lot: addresses.lot,
      rewardVault: addresses.demoScanRewardVault,
      demoScanPool: addresses.demoScanPool,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_lab_oracle", addresses.labOracle, () =>
  program.methods
    .registerLabOracle(admin.publicKey, new BN(DEMO.oracleHash))
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      oracleIdentity: admin.publicKey,
      labOracle: addresses.labOracle,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await maybeSend("register_lab", addresses.lab, () =>
  program.methods
    .registerLab(
      new BN(DEMO.labId),
      new BN(DEMO.labCapabilityMask),
      new BN(DEMO.accreditationHash),
      new BN(DEMO.regionHash),
      9_200,
      7_800,
      6_600,
    )
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      lab: addresses.lab,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);
await ensureTokenAccount(addresses.tasteMint, labStakeVault, addresses.labStake, "diet-coke-lab-stake-vault");
await ensureTokenAccount(addresses.tasteMint, labStakerTokenAccount, admin.publicKey, "diet-coke-lab-staker-token");
await ensureLabStakeDeposit();

await maybeSend("register_lab_selection_policy", addresses.labSelectionPolicy, () =>
  program.methods
    .registerLabSelectionPolicy(
      new BN(DEMO.labPolicyId),
      new BN(DEMO.claimKind),
      new BN(DEMO.labCapabilityMask),
      8_500,
      4_500,
      2_500,
      1_500,
      1_500,
      2,
      3,
    )
    .accountsStrict({
      admin: admin.publicKey,
      config: addresses.config,
      labSelectionPolicy: addresses.labSelectionPolicy,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

await ensureMint(coverageMint, "taste-plus-coverage-mint");
await ensureTokenAccount(coverageMint.publicKey, coverageTokenVault, addresses.tastePlusVault, "taste-plus-coverage-token-vault");
await ensureTokenAccount(coverageMint.publicKey, brandTokenAccount, admin.publicKey, "taste-plus-brand-token-account");
await maybeSend("open_taste_plus_vault", addresses.tastePlusVault, () =>
  program.methods
    .openTastePlusVault(new BN(TASTE_PLUS_PER_CLAIM_CAP), new BN(TASTE_PLUS_PER_WALLET_CAP))
    .accountsStrict({
      brandAuthority: admin.publicKey,
      config: addresses.config,
      brand: addresses.brand,
      coverageMint: addresses.coverageMint,
      coverageTokenVault: addresses.coverageTokenVault,
      tastePlusVault: addresses.tastePlusVault,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);
await ensureTastePlusDeposit();
await maybeSend("enroll_taste_plus_product", addresses.tastePlusProductCoverage, () =>
  program.methods
    .enrollTastePlusProduct()
    .accountsStrict({
      brandAuthority: admin.publicKey,
      config: addresses.config,
      brand: addresses.brand,
      product: addresses.product,
      tastePlusVault: addresses.tastePlusVault,
      tastePlusProductCoverage: addresses.tastePlusProductCoverage,
      systemProgram: SystemProgram.programId,
    })
    .rpc(),
);

const seededAccounts = Object.fromEntries(
  await Promise.all(
    Object.entries(addresses).map(async ([name, pubkey]) => [
      name,
      {
        address: pubkey.toBase58(),
        exists: Boolean(await connection.getAccountInfo(pubkey, "confirmed")),
        studioUrl: `${STUDIO_URL}/accounts?address=${pubkey.toBase58()}`,
        explorerUrl: `https://explorer.solana.com/address/${pubkey.toBase58()}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`,
      },
    ]),
  ),
);

const seedSummary = {
  rpcUrl: RPC_URL,
  wsUrl: WS_URL,
  studioUrl: STUDIO_URL,
  programId: PROGRAM_ID.toBase58(),
  scanClaimProgramId: SCAN_CLAIM_PROGRAM_ID.toBase58(),
  demo: DEMO,
  accounts: seededAccounts,
};
writeFileSync(outputPath, `${JSON.stringify(seedSummary, null, 2)}\n`);
console.log(JSON.stringify(seedSummary, null, 2));

async function ensureProgramDeployed() {
  await assertProgramDeployed(PROGRAM_ID, "taste_protocol");
  await assertProgramDeployed(SCAN_CLAIM_PROGRAM_ID, "taste_scan_claim");
}

async function assertProgramDeployed(programId, name) {
  const account = await connection.getAccountInfo(programId, "confirmed");
  if (account?.executable) {
    return;
  }
  throw new Error(`${name} is not deployed at ${programId.toBase58()} on ${RPC_URL}`);
}

async function ensureAirdrop(pubkey) {
  const balance = await connection.getBalance(pubkey, "confirmed");
  if (balance >= 2_000_000_000) {
    return;
  }
  const signature = await connection.requestAirdrop(pubkey, 5_000_000_000);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function maybeSend(name, account, fn) {
  if (await connection.getAccountInfo(account, "confirmed")) {
    console.log(`${name}: exists ${account.toBase58()}`);
    return null;
  }
  const signature = await fn();
  console.log(`${name}: ${signature}`);
  return signature;
}

async function ensureMint(keypair, name) {
  writeTempKeypair(name, keypair);
  if (await connection.getAccountInfo(keypair.publicKey, "confirmed")) {
    console.log(`create_coverage_mint: exists ${keypair.publicKey.toBase58()}`);
    return;
  }
  run("spl-token", [
    "--url",
    RPC_URL,
    "--fee-payer",
    WALLET_PATH,
    "create-token",
    "--decimals",
    "0",
    keypairPath(name),
  ]);
}

async function ensureTokenAccount(mint, keypair, owner, name) {
  writeTempKeypair(name, keypair);
  const account = await connection.getParsedAccountInfo(keypair.publicKey, "confirmed");
  if (account.value) {
    assertTokenAccountMatches(account.value, mint, owner, name);
    console.log(`create_token_account: exists ${keypair.publicKey.toBase58()}`);
    return;
  }
  run("spl-token", [
    "--url",
    RPC_URL,
    "--fee-payer",
    WALLET_PATH,
    "create-account",
    mint.toBase58(),
    keypairPath(name),
    "--owner",
    owner.toBase58(),
  ]);
}

async function resolveRewardMint() {
  const protocolConfig = await fetchAccountOrNull(program.account.protocolConfig, addresses.config);
  if (!protocolConfig) {
    return;
  }

  addresses.tasteMint = protocolConfig.rewardMint;
  const mintSuffix = addresses.tasteMint.toBase58().slice(0, MINT_SUFFIX_LENGTH);
  labStakeVault = seededKeypair(`diet-coke-lab-stake-vault-${mintSuffix}`);
  labStakerTokenAccount = seededKeypair(`diet-coke-lab-staker-token-${mintSuffix}`);
  demoScanRewardVault = seededKeypair(`scan2-reward-${mintSuffix}`);
  addresses.labStakeVault = labStakeVault.publicKey;
  addresses.labStakerTokenAccount = labStakerTokenAccount.publicKey;
  addresses.demoScanRewardVault = demoScanRewardVault.publicKey;
  console.log(`taste_mint: using configured ${addresses.tasteMint.toBase58()}`);
}

async function ensureRewardMint() {
  if (addresses.tasteMint.equals(tasteMint.publicKey)) {
    await ensureMint(tasteMint, "taste-token-mint");
    return;
  }
  if (await connection.getAccountInfo(addresses.tasteMint, "confirmed")) {
    console.log(`taste_mint: exists ${addresses.tasteMint.toBase58()}`);
    return;
  }
  throw new Error(`configured reward mint ${addresses.tasteMint.toBase58()} does not exist on ${RPC_URL}`);
}

async function ensureTastePlusDeposit() {
  const currentDeposit = await tokenAmount(addresses.coverageTokenVault);
  const missingDeposit = TASTE_PLUS_DEPOSIT - currentDeposit;
  if (missingDeposit <= 0) {
    console.log(`fund_taste_plus_vault: exists ${addresses.tastePlusVault.toBase58()}`);
    return;
  }
  run("spl-token", [
    "--url",
    RPC_URL,
    "--fee-payer",
    WALLET_PATH,
    "mint",
    addresses.coverageMint.toBase58(),
    missingDeposit.toString(),
    addresses.brandTokenAccount.toBase58(),
  ]);
  const signature = await program.methods
    .fundTastePlusVault(new BN(missingDeposit))
    .accountsStrict({
      brandAuthority: admin.publicKey,
      config: addresses.config,
      brand: addresses.brand,
      tastePlusVault: addresses.tastePlusVault,
      brandTokenAccount: addresses.brandTokenAccount,
      coverageTokenVault: addresses.coverageTokenVault,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`fund_taste_plus_vault: ${signature}`);
}

async function ensureLabStakeDeposit() {
  if (await connection.getAccountInfo(addresses.labStake, "confirmed")) {
    console.log(`stake_lab: exists ${addresses.labStake.toBase58()}`);
    return;
  }
  const currentStakerBalance = await tokenAmount(addresses.labStakerTokenAccount);
  const missingStakeTokens = LAB_STAKE_DEPOSIT - currentStakerBalance;
  if (missingStakeTokens > 0) {
    run("spl-token", [
      "--url",
      RPC_URL,
      "--fee-payer",
      WALLET_PATH,
      "mint",
      addresses.tasteMint.toBase58(),
      missingStakeTokens.toString(),
      addresses.labStakerTokenAccount.toBase58(),
    ]);
  }
  const signature = await program.methods
    .stakeLab(new BN(LAB_STAKE_DEPOSIT), new BN(LAB_MIN_STAKE_AMOUNT))
    .accountsStrict({
      staker: admin.publicKey,
      config: addresses.config,
      lab: addresses.lab,
      labStake: addresses.labStake,
      stakerTokenAccount: addresses.labStakerTokenAccount,
      labStakeVault: addresses.labStakeVault,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`stake_lab: ${signature}`);
}

async function ensureDemoScanPoolDeposit() {
  const currentDeposit = await tokenAmount(addresses.demoScanRewardVault);
  const missingDeposit = DEMO_SCAN_POOL_DEPOSIT - currentDeposit;
  if (missingDeposit <= 0) {
    console.log(`fund_demo_scan_pool: exists ${addresses.demoScanPool.toBase58()}`);
    return;
  }
  run("spl-token", [
    "--url",
    RPC_URL,
    "--fee-payer",
    WALLET_PATH,
    "mint",
    addresses.tasteMint.toBase58(),
    missingDeposit.toString(),
    addresses.demoScanRewardVault.toBase58(),
  ]);
  console.log(`fund_demo_scan_pool: minted ${missingDeposit} to ${addresses.demoScanRewardVault.toBase58()}`);
}

async function tokenAmount(account) {
  const result = await connection.getParsedAccountInfo(account, "confirmed");
  return Number(result.value?.data?.parsed?.info?.tokenAmount?.amount ?? 0);
}

async function fetchAccountOrNull(fetcher, pubkey) {
  try {
    return await fetcher.fetch(pubkey);
  } catch (error) {
    if (error.message?.includes("Account does not exist")) {
      return null;
    }
    throw error;
  }
}

function assertTokenAccountMatches(account, mint, owner, name) {
  const parsed = account.data?.parsed?.info;
  if (parsed?.mint === mint.toBase58() && parsed?.owner === owner.toBase58()) {
    return;
  }
  throw new Error(
    `${name} already exists with mint ${parsed?.mint ?? "unknown"} and owner ${parsed?.owner ?? "unknown"}; expected mint ${mint.toBase58()} and owner ${owner.toBase58()}`,
  );
}

function derivePda(parts, programId = PROGRAM_ID) {
  const seeds = parts.map((part) => (typeof part === "string" ? Buffer.from(part) : part));
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function u64Seed(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value.toString()));
  return bytes;
}

function seededKeypair(seedText) {
  const seed = Buffer.alloc(32);
  Buffer.from(seedText).copy(seed);
  return anchor.web3.Keypair.fromSeed(seed);
}

function keypairPath(name) {
  return join(repoRoot, ".tmp", `${name}.json`);
}

function writeTempKeypair(name, keypair) {
  writeFileSync(keypairPath(name), JSON.stringify([...keypair.secretKey]));
}

function readKeypair(path) {
  return anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(expandHome(path), "utf8"))),
  );
}

function expandHome(path) {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function assertLocalSeedRpc(rpcUrl) {
  const lowerUrl = rpcUrl.toLowerCase();
  if (MAINNET_MARKERS.some((marker) => lowerUrl.includes(marker))) {
    throw new Error("Refusing to seed TasteNet demo against a mainnet RPC.");
  }
  const host = new URL(rpcUrl).hostname;
  if (!LOCAL_RPC_HOSTS.has(host)) {
    throw new Error(`Refusing to seed TasteNet demo against non-local RPC ${rpcUrl}.`);
  }
}

function run(command, args) {
  execFileSync(resolveCliCommand(command), args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function resolveCliCommand(command) {
  return join(SOLANA_BIN_DIR, command);
}
