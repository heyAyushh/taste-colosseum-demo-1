import "./polyfills";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  deriveBrand,
  deriveDemoScanClaimReceipt,
  deriveDemoScanPool,
  deriveLot,
  deriveProduct,
  solanaExplorerAddressUrl,
} from "../api/browserSdk.js";
import { TasteScanClaimApi } from "../api/tasteScanClaimApi.js";
import {
  createWalletConnection,
  getBrowserSolanaWallet,
  useWalletConnection,
} from "./wallet.js";
import "./styles.css";

const APP_ENV = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const DEFAULT_TASTENET_RPC_URL = "http://127.0.0.1:8898";
const DEFAULT_SOLANA_LOCALNET_RPC_URL = "http://127.0.0.1:8899";
const DEFAULT_SOLANA_EXPLORER_BASE_URL = "https://explorer.solana.com";
const DEFAULT_TASTENET_STUDIO_URL = "http://127.0.0.1:18488/";
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SEEDED_SCAN_CODE = "8901764012345";
const SEEDED_CODES = [SEEDED_SCAN_CODE, "DC-0426-BAD-QC", "DIETCOKE330"] as const;
const DIRECT_SCAN_REWARD_AMOUNT = 250;
const TASTE_TOKEN_METADATA_PATH = "/token/taste-metadata.json";
const DEMO_VALUES = {
  brandId: 1886,
  productId: 330,
  lotId: 2_026_050_2,
};

type NetworkKey = "tastenet" | "localnet";
type TasteRpcUrl = string;
type ScanState = "idle" | "checking" | "resolved" | "missing";
type AsyncState = "idle" | "working" | "ready" | "error";
type DemoPoolView = {
  rewardMint: PublicKey;
  rewardVault: PublicKey;
  rewardAmount: number;
  maxClaims: number;
  claimsPaid: number;
  remainingClaims: number;
  active: boolean;
  alreadyClaimed: boolean;
  claimReceiptAddress: PublicKey;
  scannerTokenAccount: PublicKey | null;
  scannerTokenBalance: string;
};
type TokenProfile = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  externalUrl: string;
};

const DEFAULT_TOKEN_PROFILE: TokenProfile = {
  name: "Taste Reward Token",
  symbol: "TASTE",
  description:
    "Direct scan reward token for the taste.fun local demo. Scanning the seeded Diet Coke batch releases a fixed payout from a brand-funded pool.",
  image: "/token/taste-logo.svg",
  externalUrl: "/",
};

const NETWORKS: Array<{
  key: NetworkKey;
  label: string;
  rpcUrl: TasteRpcUrl;
  note: string;
}> = [
  {
    key: "localnet",
    label: "Solana Localnet",
    rpcUrl: envUrl(APP_ENV.VITE_SOLANA_LOCALNET_RPC_URL, DEFAULT_SOLANA_LOCALNET_RPC_URL),
    note: "standard validator",
  },
  {
    key: "tastenet",
    label: "TasteNet",
    rpcUrl: envUrl(APP_ENV.VITE_TASTENET_RPC_URL, DEFAULT_TASTENET_RPC_URL),
    note: "diet coke reward pool",
  },
];

function App() {
  const {
    availableWallets,
    connectWallet,
    isWalletConnected,
    selectWallet,
    selectedWalletId,
    selectedWalletLabel,
    walletAddress,
    walletMessage,
    walletPublicKey,
    walletState,
  } = useWalletConnection();
  const [activeNetworkKey, setActiveNetworkKey] = useState<NetworkKey>("localnet");
  const [scanInput, setScanInput] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanMessage, setScanMessage] = useState("Scan the seeded Diet Coke batch to unlock the claim pool.");
  const [airdropState, setAirdropState] = useState<AsyncState>("idle");
  const [airdropMessage, setAirdropMessage] = useState("Fund wallet for TasteNet fees.");
  const [claimState, setClaimState] = useState<AsyncState>("idle");
  const [claimMessage, setClaimMessage] = useState("One claim per wallet. The pool enforces it on-chain.");
  const [poolState, setPoolState] = useState<AsyncState>("idle");
  const [poolMessage, setPoolMessage] = useState("Waiting for a matching scan.");
  const [demoPoolView, setDemoPoolView] = useState<DemoPoolView | null>(null);
  const [tokenProfile, setTokenProfile] = useState<TokenProfile>(DEFAULT_TOKEN_PROFILE);

  const activeNetwork = NETWORKS.find((network) => network.key === activeNetworkKey) ?? NETWORKS[0];
  const connection = useMemo(() => createWalletConnection(activeNetwork.rpcUrl), [activeNetwork.rpcUrl]);
  const explorerBaseUrl = envUrl(APP_ENV.VITE_SOLANA_EXPLORER_BASE_URL, DEFAULT_SOLANA_EXPLORER_BASE_URL);
  const studioUrl = envUrl(APP_ENV.VITE_TASTENET_STUDIO_URL, DEFAULT_TASTENET_STUDIO_URL);
  const brand = useMemo(() => deriveBrand(DEMO_VALUES.brandId), []);
  const product = useMemo(() => deriveProduct(DEMO_VALUES.productId), []);
  const lot = useMemo(() => deriveLot(product, DEMO_VALUES.lotId), [product]);
  const demoScanPool = useMemo(() => deriveDemoScanPool(product, lot), [lot, product]);
  const demoScanClaimReceipt = useMemo(
    () => (walletPublicKey ? deriveDemoScanClaimReceipt(demoScanPool, walletPublicKey) : null),
    [demoScanPool, walletPublicKey],
  );
  const metadataAddress = useMemo(
    () => (demoPoolView ? deriveMetadataAddress(demoPoolView.rewardMint) : null),
    [demoPoolView],
  );
  const productResolved = scanState === "resolved";

  useEffect(() => {
    let cancelled = false;
    void fetch(TASTE_TOKEN_METADATA_PATH)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Metadata file returned ${response.status}`);
        }
        return (await response.json()) as Record<string, unknown>;
      })
      .then((document) => {
        if (cancelled) {
          return;
        }
        setTokenProfile({
          name: typeof document.name === "string" ? document.name : DEFAULT_TOKEN_PROFILE.name,
          symbol: typeof document.symbol === "string" ? document.symbol : DEFAULT_TOKEN_PROFILE.symbol,
          description:
            typeof document.description === "string"
              ? document.description
              : DEFAULT_TOKEN_PROFILE.description,
          image: typeof document.image === "string" ? document.image : DEFAULT_TOKEN_PROFILE.image,
          externalUrl:
            typeof document.external_url === "string"
              ? document.external_url
              : DEFAULT_TOKEN_PROFILE.externalUrl,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTokenProfile(DEFAULT_TOKEN_PROFILE);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPoolState = useCallback(async () => {
    if (!productResolved) {
      setDemoPoolView(null);
      setPoolState("idle");
      setPoolMessage("Waiting for a matching scan.");
      return;
    }
    setPoolState("working");
    try {
      const readonlyProvider = createReadonlyAnchorProvider(connection, walletPublicKey ?? brand);
      const api = TasteScanClaimApi.fromProvider(readonlyProvider);
      const [poolAccount, claimReceiptAccount] = await Promise.all([
        api.program.account.demoScanPool.fetch(demoScanPool),
        walletPublicKey && demoScanClaimReceipt
          ? api.program.account.demoScanClaimReceipt.fetch(demoScanClaimReceipt).catch(() => null)
          : Promise.resolve(null),
      ]);
      const scannerTokenAccount =
        walletPublicKey === null
          ? null
          : getAssociatedTokenAddressSync(
              poolAccount.rewardMint,
              walletPublicKey,
              false,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID,
            );
      const scannerTokenBalance =
        scannerTokenAccount === null
          ? "0"
          : await fetchTokenBalance(connection, scannerTokenAccount);
      const rewardAmount = Number(poolAccount.rewardAmount.toString());
      const maxClaims = Number(poolAccount.maxClaims.toString());
      const claimsPaid = Number(poolAccount.claimsPaid.toString());
      setDemoPoolView({
        rewardMint: poolAccount.rewardMint,
        rewardVault: poolAccount.rewardVault,
        rewardAmount,
        maxClaims,
        claimsPaid,
        remainingClaims: Math.max(maxClaims - claimsPaid, 0),
        active: poolAccount.active,
        alreadyClaimed: claimReceiptAccount !== null,
        claimReceiptAddress: walletPublicKey && demoScanClaimReceipt ? demoScanClaimReceipt : demoScanPool,
        scannerTokenAccount,
        scannerTokenBalance,
      });
      setPoolState("ready");
      setPoolMessage(
        claimReceiptAccount
          ? "This wallet already claimed from the demo pool."
          : poolAccount.active
            ? `${rewardAmount} $TASTE is ready for this scan.`
            : "The demo pool is no longer active.",
      );
    } catch (error) {
      setDemoPoolView(null);
      setPoolState("error");
      setPoolMessage(error instanceof Error ? error.message : "Could not load the demo pool.");
    }
  }, [brand, connection, demoScanClaimReceipt, demoScanPool, productResolved, walletPublicKey]);

  useEffect(() => {
    void refreshPoolState();
  }, [refreshPoolState]);

  function resolveScan() {
    setScanState("checking");
    const normalizedInput = scanInput.trim().toUpperCase();
    window.setTimeout(() => {
      if (!SEEDED_CODES.some((code) => code.toUpperCase() === normalizedInput)) {
        setScanState("missing");
        setScanMessage("No seeded Diet Coke batch matched that code.");
        return;
      }
      setScanState("resolved");
      setScanMessage("Diet Coke 330ml lot DC-0426-BAD-QC matched.");
    }, 200);
  }

  function loadSeededCode() {
    setScanInput(SEEDED_SCAN_CODE);
    setScanState("resolved");
    setScanMessage("Diet Coke 330ml lot DC-0426-BAD-QC matched.");
  }

  async function requestAirdrop() {
    setAirdropState("working");
    try {
      if (!walletPublicKey) {
        throw new Error("Choose and connect a wallet before funding it.");
      }
      if (activeNetwork.key === "tastenet") {
        const response = await fetch("/__tastenet/fund-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletPublicKey.toBase58() }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Funding failed");
        }
        setAirdropMessage("Wallet funded for TasteNet fees.");
      } else {
        const signature = await connection.requestAirdrop(walletPublicKey, 1_000_000_000);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        setAirdropMessage("Wallet funded for localnet fees.");
      }
      setAirdropState("ready");
      await refreshPoolState();
    } catch (error) {
      setAirdropState("error");
      setAirdropMessage(error instanceof Error ? error.message : "Funding failed");
    }
  }

  async function claimReward() {
    setClaimState("working");
    try {
      if (!walletPublicKey || !demoPoolView) {
        throw new Error("Connect a wallet and load the pool before claiming.");
      }
      if (!demoPoolView.active) {
        throw new Error("The demo pool is not active.");
      }
      if (demoPoolView.alreadyClaimed) {
        throw new Error("This wallet already claimed from the demo pool.");
      }
      if (!demoPoolView.scannerTokenAccount) {
        throw new Error("Reward token account is not available for this wallet.");
      }
      const wallet = getBrowserSolanaWallet();
      if (!wallet) {
        throw new Error("Selected wallet is not available.");
      }
      const readonlyProvider = createReadonlyAnchorProvider(connection, walletPublicKey);
      const api = TasteScanClaimApi.fromProvider(readonlyProvider);
      const instructions = [];
      const ataInfo = await connection.getAccountInfo(demoPoolView.scannerTokenAccount, "confirmed");
      if (!ataInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            walletPublicKey,
            demoPoolView.scannerTokenAccount,
            walletPublicKey,
            demoPoolView.rewardMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }
      instructions.push(
        await api
          .claimDemoScanReward({
            scanner: walletPublicKey,
            brand,
            product,
            lot,
            rewardVault: demoPoolView.rewardVault,
            scannerTokenAccount: demoPoolView.scannerTokenAccount,
          })
          .instruction(),
      );

      const transaction = new Transaction().add(...instructions);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = walletPublicKey;
      transaction.recentBlockhash = blockhash;
      const { signature } = await signAndBroadcastWalletTransaction({
        wallet,
        connection,
        transaction,
        blockhash,
        lastValidBlockHeight,
      });
      setClaimState("ready");
      setClaimMessage(`Claim sent: ${shortSignature(signature)}`);
      await refreshPoolState();
    } catch (error) {
      setClaimState("error");
      setClaimMessage(error instanceof Error ? error.message : "Claim failed");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">taste.fun direct scan demo</p>
          <h1>Scan Diet Coke. Claim from the pool.</h1>
        </div>
        <div className="topbar-controls">
          <label className="stacked-field">
            <span>RPC</span>
            <select value={activeNetwork.key} onChange={(event) => setActiveNetworkKey(event.target.value as NetworkKey)}>
              {NETWORKS.map((network) => (
                <option key={network.key} value={network.key}>
                  {network.label}
                </option>
              ))}
            </select>
          </label>
          <label className="stacked-field">
            <span>Wallet</span>
            <select
              value={selectedWalletId ?? ""}
              onChange={(event) => selectWallet(event.target.value)}
            >
              {availableWallets.length === 0 ? <option value="">No wallet found</option> : null}
              {availableWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void connectWallet()} type="button">
            {walletState === "connecting" ? "Connecting" : isWalletConnected ? "Connected" : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">seeded batch</p>
          <h2>One scan, one wallet, one claim receipt.</h2>
          <p className="lede">
            This demo does not open a claim market. It releases a fixed amount of $TASTE straight
            from a brand-funded pool when the seeded Diet Coke batch is scanned.
          </p>
        </div>
        <dl className="summary-grid">
          <div>
            <dt>Product</dt>
            <dd>Diet Coke 330ml</dd>
          </div>
          <div>
            <dt>Lot</dt>
            <dd>DC-0426-BAD-QC</dd>
          </div>
          <div>
            <dt>Pool rule</dt>
            <dd>One claim per wallet</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{activeNetwork.label}</dd>
          </div>
        </dl>
      </section>

      <section className="card token-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">token</p>
            <h2>{tokenProfile.name}</h2>
          </div>
          <a href={TASTE_TOKEN_METADATA_PATH} target="_blank" rel="noreferrer">
            Open metadata JSON
          </a>
        </div>
        <div className="token-identity">
          <img
            alt={`${tokenProfile.symbol} logo`}
            className="token-logo"
            src={tokenProfile.image}
          />
          <div className="token-copy">
            <p className="token-symbol">{tokenProfile.symbol}</p>
            <p className="token-description">{tokenProfile.description}</p>
          </div>
        </div>
        <dl className="summary-grid">
          <div>
            <dt>Payout</dt>
            <dd>{DIRECT_SCAN_REWARD_AMOUNT} $TASTE</dd>
          </div>
          <div>
            <dt>Decimals</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>Claim mode</dt>
            <dd>Direct pool</dd>
          </div>
          <div>
            <dt>Wallet rule</dt>
            <dd>One receipt</dd>
          </div>
        </dl>
        {demoPoolView ? (
          <div className="link-grid">
            <ExplorerLink
              label="Reward mint"
              address={demoPoolView.rewardMint}
              rpcUrl={activeNetwork.rpcUrl}
              explorerBaseUrl={explorerBaseUrl}
            />
            {metadataAddress ? (
              <ExplorerLink
                label="Metadata"
                address={metadataAddress}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
            ) : null}
          </div>
        ) : (
          <p className="status idle">Resolve the seeded batch to load the live mint and metadata account.</p>
        )}
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">scan</p>
            <h2>Resolve the seeded batch</h2>
          </div>
          <small>{activeNetwork.note}</small>
        </div>
        <label className="stacked-field">
          <span>Product code</span>
          <input
            value={scanInput}
            onChange={(event) => setScanInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                resolveScan();
              }
            }}
            placeholder="barcode, lot code, or demo code"
          />
        </label>
        <div className="button-row">
          <button onClick={resolveScan} disabled={scanInput.trim().length === 0 || scanState === "checking"} type="button">
            {scanState === "checking" ? "Checking" : "Resolve scan"}
          </button>
          <button onClick={loadSeededCode} type="button">Load demo code</button>
          <button onClick={() => void requestAirdrop()} disabled={!walletPublicKey || airdropState === "working"} type="button">
            {airdropState === "working" ? "Funding" : "Airdrop"}
          </button>
        </div>
        <p className={`status ${scanState}`}>{scanMessage}</p>
        <p className={`status ${airdropState}`}>{airdropMessage}</p>
        <p className={`status ${walletState}`}>{walletMessage}</p>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">pool</p>
            <h2>Direct scan payout</h2>
          </div>
          <a href={studioUrl} target="_blank" rel="noreferrer">
            Open Studio
          </a>
        </div>
        {demoPoolView ? (
          <>
            <dl className="summary-grid">
              <div>
                <dt>Reward</dt>
                <dd>{demoPoolView.rewardAmount} $TASTE</dd>
              </div>
              <div>
                <dt>Remaining claims</dt>
                <dd>{demoPoolView.remainingClaims}</dd>
              </div>
              <div>
                <dt>Wallet claimed</dt>
                <dd>{demoPoolView.alreadyClaimed ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Wallet balance</dt>
                <dd>{demoPoolView.scannerTokenBalance}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                onClick={() => void claimReward()}
                disabled={
                  !productResolved ||
                  !isWalletConnected ||
                  claimState === "working" ||
                  !demoPoolView.active ||
                  demoPoolView.alreadyClaimed
                }
                type="button"
              >
                {claimState === "working" ? "Claiming" : `Claim ${DIRECT_SCAN_REWARD_AMOUNT} $TASTE`}
              </button>
              <button onClick={() => void refreshPoolState()} type="button">Refresh pool</button>
            </div>
            <p className={`status ${poolState}`}>{poolMessage}</p>
            <p className={`status ${claimState}`}>{claimMessage}</p>
            <div className="link-grid">
              <ExplorerLink
                label="Brand"
                address={brand}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
              <ExplorerLink
                label="Product"
                address={product}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
              <ExplorerLink
                label="Lot"
                address={lot}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
              <ExplorerLink
                label="Pool"
                address={demoScanPool}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
              <ExplorerLink
                label="Pool vault"
                address={demoPoolView.rewardVault}
                rpcUrl={activeNetwork.rpcUrl}
                explorerBaseUrl={explorerBaseUrl}
              />
              {demoScanClaimReceipt ? (
                <ExplorerLink
                  label="Claim receipt"
                  address={demoScanClaimReceipt}
                  rpcUrl={activeNetwork.rpcUrl}
                  explorerBaseUrl={explorerBaseUrl}
                />
              ) : null}
            </div>
          </>
        ) : (
          <p className={`status ${poolState}`}>{poolMessage}</p>
        )}
      </section>
    </main>
  );
}

function ExplorerLink(params: {
  label: string;
  address: PublicKey;
  rpcUrl: string;
  explorerBaseUrl: string;
}) {
  return (
    <a
      className="explorer-link"
      href={solanaExplorerAddressUrl(params.address, "localnet", params.rpcUrl, params.explorerBaseUrl)}
      rel="noreferrer"
      target="_blank"
    >
      <span>{params.label}</span>
      <strong>{shortAddress(params.address)}</strong>
    </a>
  );
}

function createReadonlyAnchorProvider(connection: ReturnType<typeof createWalletConnection>, walletPublicKey: PublicKey) {
  const wallet = {
    publicKey: walletPublicKey,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]) => transactions,
    signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T) => transaction,
  } as unknown as anchor.Wallet;

  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

async function signAndBroadcastWalletTransaction(params: {
  wallet: ReturnType<typeof getBrowserSolanaWallet>;
  connection: ReturnType<typeof createWalletConnection>;
  transaction: Transaction;
  blockhash: string;
  lastValidBlockHeight: number;
}) {
  const { wallet, connection, transaction, blockhash, lastValidBlockHeight } = params;
  if (!wallet?.publicKey) {
    throw new Error("Wallet is not connected.");
  }

  if (wallet.signTransaction) {
    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
    });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return { signature };
  }

  if (wallet.signAndSendTransaction) {
    const { signature } = await wallet.signAndSendTransaction(transaction);
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return { signature };
  }

  throw new Error("Selected wallet cannot sign transactions.");
}

async function fetchTokenBalance(
  connection: ReturnType<typeof createWalletConnection>,
  tokenAccount: PublicKey,
) {
  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount, "confirmed");
    return balance.value.amount;
  } catch {
    return "0";
  }
}

function envUrl(value: string | undefined, fallback: string): TasteRpcUrl {
  const trimmed = value?.trim();
  return (trimmed && trimmed.length > 0 ? trimmed : fallback) as TasteRpcUrl;
}

function shortAddress(address: PublicKey) {
  const base58 = address.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
}

function shortSignature(signature: string) {
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function deriveMetadataAddress(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
