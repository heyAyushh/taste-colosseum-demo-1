#!/usr/bin/env bash
set -euo pipefail

RPC_PORT="${SURFPOOL_RPC_PORT:-8898}"
WS_PORT="${SURFPOOL_WS_PORT:-8899}"
STUDIO_PORT="${SURFPOOL_STUDIO_PORT:-18488}"
RPC_URL="${SURFPOOL_RPC_URL:-http://127.0.0.1:${RPC_PORT}}"
WS_URL="${SURFPOOL_WS_URL:-ws://127.0.0.1:${WS_PORT}}"
CORE_REPO_URL="${TASTE_CORE_REPO_URL:-https://github.com/makrozoia-space/taste-core.git}"
CORE_REF="${TASTE_CORE_REF:-main}"
WORK_DIR=".exe"
CORE_DIR="${WORK_DIR}/taste-core"
LOG_DIR="${WORK_DIR}/logs"
SURFPOOL_LOG="${LOG_DIR}/surfpool.log"
SURFPOOL_PID="${WORK_DIR}/surfpool.pid"
METAPLEX_PROGRAM_ID="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"

mkdir -p "${LOG_DIR}"

export PATH="${HOME}/.cargo/bin:${HOME}/.avm/bin:${HOME}/.local/share/solana/install/active_release/bin:${PATH}"
export ANCHOR_WALLET="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"
export TASTENET_RPC_URL="${RPC_URL}"
export TASTENET_WS_URL="${WS_URL}"
export TASTENET_STUDIO_URL="${TASTENET_STUDIO_URL:-http://127.0.0.1:${STUDIO_PORT}}"

main() {
  ensure_toolchain
  ensure_wallet
  install_js_dependencies
  prepare_taste_core
  build_programs
  prepare_metaplex_program
  start_surfpool
  deploy_programs
  seed_demo_pool
  write_runtime_env

  echo "Surfpool RPC is ready at ${RPC_URL}"
  echo "Set exe.dev HTTP sharing to port ${RPC_PORT} for RPC access."
}

ensure_toolchain() {
  if ! command -v rustup >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  fi

  if ! command -v solana >/dev/null 2>&1 || ! command -v spl-token >/dev/null 2>&1; then
    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  fi

  if ! command -v anchor >/dev/null 2>&1; then
    if ! command -v avm >/dev/null 2>&1; then
      cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    fi
    avm install 0.32.1
    avm use 0.32.1
  fi

  if ! command -v surfpool >/dev/null 2>&1; then
    curl -sL https://run.surfpool.run/ | bash
  fi
}

ensure_wallet() {
  mkdir -p "$(dirname "${ANCHOR_WALLET}")"
  if [ ! -f "${ANCHOR_WALLET}" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "${ANCHOR_WALLET}"
  fi
}

install_js_dependencies() {
  npm ci
}

prepare_taste_core() {
  if [ ! -d "${CORE_DIR}/.git" ]; then
    git clone "${CORE_REPO_URL}" "${CORE_DIR}"
  fi

  git -C "${CORE_DIR}" fetch --depth 1 origin "${CORE_REF}"
  git -C "${CORE_DIR}" checkout FETCH_HEAD
  npm --prefix "${CORE_DIR}" ci

  cp "${CORE_DIR}/api/taste_protocol.idl.json" api/taste_protocol.idl.json
}

build_programs() {
  npm --prefix "${CORE_DIR}" run build:program
  anchor build --program-name taste_scan_claim
}

prepare_metaplex_program() {
  if [ -f "${WORK_DIR}/metaplex_token_metadata.so" ]; then
    return
  fi

  solana program dump "${METAPLEX_PROGRAM_ID}" "${WORK_DIR}/metaplex_token_metadata.so" \
    --url https://api.mainnet-beta.solana.com
}

start_surfpool() {
  if rpc_is_healthy; then
    return
  fi

  surfpool start \
    --port "${RPC_PORT}" \
    --ws-port "${WS_PORT}" \
    --studio-port "${STUDIO_PORT}" \
    --no-tui \
    --no-studio \
    --no-deploy \
    --network mainnet \
    --legacy-anchor-compatibility \
    --yes > "${SURFPOOL_LOG}" 2>&1 &

  echo "$!" > "${SURFPOOL_PID}"
  wait_for_rpc
}

deploy_programs() {
  surfpool run runbooks/deployment/main.tx \
    --unsupervised \
    --force \
    --input "rpc_api_url=${RPC_URL}" \
    --input "network_id=surfnet"
}

seed_demo_pool() {
  node scripts/seed-surfpool-demo.mjs
}

write_runtime_env() {
  {
    echo "VITE_TASTENET_RPC_URL=${RPC_URL}"
    echo "VITE_TASTENET_STUDIO_URL=${TASTENET_STUDIO_URL}"
    echo "TASTENET_BACKEND_RPC_URL=${RPC_URL}"
  } > "${WORK_DIR}/runtime.env"
}

wait_for_rpc() {
  for _ in $(seq 1 90); do
    if rpc_is_healthy; then
      return
    fi
    sleep 2
  done

  echo "Surfpool did not become healthy. Last log lines:" >&2
  tail -80 "${SURFPOOL_LOG}" >&2 || true
  exit 1
}

rpc_is_healthy() {
  curl --fail --silent --show-error --max-time 2 \
    -X POST "${RPC_URL}" \
    -H "content-type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    | grep -q '"result":"ok"'
}

main "$@"
