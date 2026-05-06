import { Connection, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

type BrowserSolanaWallet = {
  isBackpack?: boolean;
  isPhantom?: boolean;
  isSolflare?: boolean;
  name?: string;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey?: PublicKey } | void>;
  signAndSendTransaction?: (transaction: unknown) => Promise<{ signature: string }>;
  signTransaction?: <T>(transaction: T) => Promise<T>;
};

type BrowserBackpackContainer = {
  solana?: BrowserSolanaWallet;
};

type BrowserWindowWithWallet = Window & {
  backpack?: BrowserBackpackContainer;
  solana?: BrowserSolanaWallet;
  solflare?: BrowserSolanaWallet;
};

type BrowserSolanaWalletWithProviders = BrowserSolanaWallet & {
  providers?: BrowserSolanaWallet[];
};

type DiscoveredBrowserWallet = {
  id: string;
  label: string;
  provider: BrowserSolanaWallet;
};

export type WalletConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type SelectableBrowserWallet = {
  id: string;
  label: string;
};

let selectedBrowserWallet: BrowserSolanaWallet | null = null;

export function createWalletConnection(rpcEndpoint: string) {
  const wsEndpoint = tasteNetWsEndpoint(rpcEndpoint);
  return new Connection(
    rpcEndpoint,
    wsEndpoint ? { commitment: "confirmed", wsEndpoint } : "confirmed",
  );
}

export function getBrowserSolanaWallet() {
  return selectedBrowserWallet;
}

export function useWalletConnection() {
  const [availableWallets, setAvailableWallets] = useState<SelectableBrowserWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletState, setWalletState] = useState<WalletConnectionState>("disconnected");
  const [walletMessage, setWalletMessage] = useState("choose a wallet");

  const walletPublicKey = useMemo(
    () => (walletAddress ? new PublicKey(walletAddress) : null),
    [walletAddress],
  );
  const discoveredWallets = useMemo(() => discoverBrowserSolanaWallets(), [availableWallets]);
  const selectedWallet = useMemo(
    () => discoveredWallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [discoveredWallets, selectedWalletId],
  );

  const refreshAvailableWallets = useCallback(() => {
    const nextWallets = discoverBrowserSolanaWallets();
    setAvailableWallets(nextWallets.map(({ id, label }) => ({ id, label })));
    setSelectedWalletId((currentWalletId) => {
      if (currentWalletId && nextWallets.some((wallet) => wallet.id === currentWalletId)) {
        return currentWalletId;
      }
      return nextWallets[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    refreshAvailableWallets();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAvailableWallets();
      }
    };
    window.addEventListener("focus", refreshAvailableWallets);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshAvailableWallets);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshAvailableWallets]);

  useEffect(() => {
    selectedBrowserWallet = selectedWallet?.provider ?? null;
    if (selectedWallet) {
      return;
    }
    setWalletMessage(discoveredWallets.length > 0 ? "choose a wallet" : "no wallet found");
  }, [discoveredWallets.length, selectedWallet]);

  function selectWallet(walletId: string) {
    const nextWallet = discoveredWallets.find((wallet) => wallet.id === walletId) ?? null;
    setSelectedWalletId(walletId);
    setWalletAddress(null);
    setWalletState("disconnected");
    setWalletMessage(nextWallet ? `selected ${nextWallet.label}` : "choose a wallet");
  }

  async function connectWallet() {
    setWalletState("connecting");
    try {
      const wallet = selectedWallet?.provider ?? null;
      if (!wallet) {
        throw new Error(
          discoveredWallets.length > 0 ? "Choose a wallet before connecting" : "No Solana wallet found",
        );
      }
      selectedBrowserWallet = wallet;
      const response = await wallet.connect();
      const connectedPublicKey = response?.publicKey ?? wallet.publicKey ?? null;
      if (!connectedPublicKey) {
        throw new Error("Wallet connected without a public key");
      }
      setWalletAddress(connectedPublicKey.toBase58());
      setWalletMessage(
        `connected ${selectedWallet?.label ?? "wallet"} ${shortWalletAddress(connectedPublicKey.toBase58())}`,
      );
      setWalletState("connected");
      return true;
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Wallet connection failed");
      setWalletState("error");
      return false;
    }
  }

  return {
    availableWallets,
    connectWallet,
    isWalletConnected: walletState === "connected" && walletPublicKey !== null,
    refreshAvailableWallets,
    selectWallet,
    selectedWalletId,
    selectedWalletLabel: selectedWallet?.label ?? null,
    walletAddress,
    walletMessage,
    walletPublicKey,
    walletState,
  };
}

function shortWalletAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function discoverBrowserSolanaWallets(): DiscoveredBrowserWallet[] {
  const browserWindow = window as BrowserWindowWithWallet;
  const seenProviders = new Set<BrowserSolanaWallet>();
  const discoveredWallets: DiscoveredBrowserWallet[] = [];

  function registerWallet(candidate: BrowserSolanaWallet | undefined) {
    if (!candidate || seenProviders.has(candidate)) {
      return;
    }
    seenProviders.add(candidate);
    discoveredWallets.push({
      id: walletProviderId(candidate, discoveredWallets.length),
      label: walletProviderLabel(candidate, discoveredWallets.length),
      provider: candidate,
    });
  }

  const rootProvider = browserWindow.solana as BrowserSolanaWalletWithProviders | undefined;
  rootProvider?.providers?.forEach(registerWallet);
  registerWallet(browserWindow.backpack?.solana);
  registerWallet(browserWindow.solflare);
  registerWallet(rootProvider);

  return discoveredWallets;
}

function walletProviderId(provider: BrowserSolanaWallet, index: number) {
  if (provider.isBackpack) {
    return "backpack";
  }
  if (provider.isSolflare) {
    return "solflare";
  }
  if (provider.isPhantom) {
    return "phantom";
  }
  if (provider.name) {
    return provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
  return `injected-wallet-${index + 1}`;
}

function walletProviderLabel(provider: BrowserSolanaWallet, index: number) {
  if (provider.isBackpack) {
    return "Backpack";
  }
  if (provider.isSolflare) {
    return "Solflare";
  }
  if (provider.isPhantom) {
    return "Phantom";
  }
  if (provider.name) {
    return provider.name;
  }
  return `Injected wallet ${index + 1}`;
}

function tasteNetWsEndpoint(rpcEndpoint: string): string | undefined {
  if (rpcEndpoint === "http://127.0.0.1:8899" || rpcEndpoint === "http://localhost:8899") {
    return "ws://127.0.0.1:8900";
  }
  if (rpcEndpoint === "http://127.0.0.1:8898" || rpcEndpoint === "http://localhost:8898") {
    return "ws://127.0.0.1:8897";
  }
  return undefined;
}
