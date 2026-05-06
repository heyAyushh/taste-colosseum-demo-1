import { type IncomingMessage, type ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";

const DEFAULT_TASTENET_RPC_URL = "http://127.0.0.1:8898";
const DEFAULT_WALLET_FEE_AIRDROP_LAMPORTS = 1_000_000_000;
const FAUCET_ROUTE = "/__tastenet/fund-wallet";
const LOCAL_TASTENET_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

type FundWalletRequest = {
  wallet?: string;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tasteNetRpcUrl = readEnvUrl(
    env.TASTENET_BACKEND_RPC_URL ?? env.VITE_TASTENET_RPC_URL,
    DEFAULT_TASTENET_RPC_URL,
  );

  return {
    plugins: [react(), createTasteNetFundingPlugin(tasteNetRpcUrl)],
    resolve: {
      alias: {
        buffer: "buffer/",
      },
    },
    server: {
      allowedHosts: [".loca.lt", ".trycloudflare.com"],
    },
  };
});

function createTasteNetFundingPlugin(rpcUrl: string) {
  return {
    name: "tastenet-funding",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith(FAUCET_ROUTE) || request.method !== "POST") {
          next();
          return;
        }
        if (!isLocalRpc(rpcUrl)) {
          sendJson(response, 400, {
            error: `TasteNet funding is limited to local RPCs. Refusing ${rpcUrl}.`,
          });
          return;
        }
        try {
          const payload = (await readJsonBody(request)) as FundWalletRequest;
          const wallet = parseWalletAddress(payload.wallet);
          const connection = new Connection(rpcUrl, "confirmed");
          const signature = await connection.requestAirdrop(wallet, DEFAULT_WALLET_FEE_AIRDROP_LAMPORTS);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
          sendJson(response, 200, {
            rpcUrl,
            signature,
            wallet: wallet.toBase58(),
          });
        } catch (error) {
          sendJson(response, 400, {
            error: error instanceof Error ? error.message : "TasteNet funding failed",
          });
        }
      });
    },
  };
}

function readEnvUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function isLocalRpc(rpcUrl: string) {
  try {
    const endpoint = new URL(rpcUrl);
    return LOCAL_TASTENET_HOSTS.has(endpoint.hostname);
  } catch {
    return false;
  }
}

async function readJsonBody(request: IncomingMessage) {
  const bodyChunks: Uint8Array[] = [];
  for await (const chunk of request) {
    bodyChunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(bodyChunks).toString("utf8");
  return rawBody.length === 0 ? {} : JSON.parse(rawBody);
}

function parseWalletAddress(value: string | undefined) {
  if (!value) {
    throw new Error("Wallet address is required.");
  }
  return new PublicKey(value);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}
