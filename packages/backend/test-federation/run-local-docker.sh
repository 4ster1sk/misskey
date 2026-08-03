#!/usr/bin/env bash
# SPDX-FileCopyrightText: syuilo and misskey-project, yojo-art team
# SPDX-License-Identifier: AGPL-3.0-only
#
# Run federation tests locally in a clean Docker environment.
# Usage:
#   ./run-local-docker.sh                    # run all tests
#   ./run-local-docker.sh timeline.test.ts   # run a specific test file
#   ./run-local-docker.sh --skip-build       # skip pnpm build
#   ./run-local-docker.sh --clean            # remove node_modules & built/, then exit

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
export REPO_ROOT

source "${REPO_ROOT}/scripts/docker-common.sh"

load_misskey_versions

BUILD_IMAGE_TAG="misskey-build-env:${NODE_VERSION}-pnpm${PNPM_VERSION}"

CLEAN=0
TEST_FILTER=""
for arg in "$@"; do
    case "${arg}" in
        --clean)
            CLEAN=1
            ;;
				--skip-build)
						SKIP_BUILD=1
						;;
        *)
            TEST_FILTER="${arg}"
            ;;
    esac
done

if [[ "${CLEAN}" == "1" ]]; then
    REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
    echo "==> --clean: removing node_modules, built/, and generated test configs …"

    # Glob expansion for the .config/* patterns: if nothing matches, expand
    # to nothing instead of the literal pattern string.
    shopt -s nullglob
    CONFIG_FILES=(
        "${SCRIPT_DIR}/.config/"*.test.conf
        "${SCRIPT_DIR}/.config/"*.test.config.json
        "${SCRIPT_DIR}/.config/docker.env"
    )
    shopt -u nullglob

    rm -rf \
        "${REPO_ROOT}/node_modules" \
        "${REPO_ROOT}/built" \
        "${REPO_ROOT}/packages/backend/node_modules" \
        "${REPO_ROOT}/packages/backend/built" \
        "${REPO_ROOT}/packages/misskey-js/node_modules" \
        "${REPO_ROOT}/packages/misskey-js/built" \
        "${REPO_ROOT}/packages/misskey-reversi/node_modules" \
        "${REPO_ROOT}/packages/misskey-reversi/built" \
        "${CONFIG_FILES[@]}"
    echo "==> Clean done."
    exit 0
fi

# ──────────────────────────────────────────────
# 1. Generate configs / certificates if missing
# ──────────────────────────────────────────────
if [[ ! -d certificates || ! -f .config/a.test.conf || ! -f .config/a.test.config.json ]]; then
    echo "==> Running setup.sh…"
    bash ./setup.sh
fi

# ──────────────────────────────────────────────
# 2. Build backend & deps (backend / misskey-js / misskey-reversi)
#    Skips frontend which requires submodules.
#
#    Runs inside a throwaway Docker container so the host Node
#    toolchain is never touched. Output (node_modules/built) is
#    bind-mounted, so files land on the host with whatever UID/GID
#    we run the container as — we use the host user's, to avoid
#    root-owned files.
# ──────────────────────────────────────────────
ensure_runtime_image "${BUILD_IMAGE_TAG}" "${SCRIPT_DIR}"

# Ensure build output directories are owned by the host user. Previous
# container runs may have created them as root, causing EACCES when the
# build step (which runs as the host user) tries to write meta.json etc.
ensure_output_ownership "$(id -u)" "$(id -g)" \
    built \
    node_modules \
    packages/backend/built packages/backend/node_modules \
    packages/misskey-js/built packages/misskey-js/node_modules \
    packages/misskey-reversi/built packages/misskey-reversi/node_modules

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
    HOST_UID="$(id -u)"
    HOST_GID="$(id -g)"
    echo "==> Building backend & deps (in Docker, as uid=${HOST_UID} gid=${HOST_GID})…"

    docker run --rm \
        --user "$(id -u):$(id -g)" \
        -v "${REPO_ROOT}:/misskey" \
        -w /misskey \
        -e HOME=/tmp \
        -e PNPM_HOME=/tmp/pnpm \
        -e CI=true \
        "${BUILD_IMAGE_TAG}" \
        bash -c 'pnpm i --frozen-lockfile && pnpm build-pre && pnpm --filter backend --filter misskey-js --filter misskey-reversi build'
else
    echo "==> Skipping build (SKIP_BUILD=1)"
fi

# Ensure built/meta.json exists even when the build step is skipped;
# backend loadConfig() requires it at runtime.
if [[ ! -f "${REPO_ROOT}/built/meta.json" ]]; then
    echo "==> Generating built/meta.json…"
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        -v "${REPO_ROOT}:/misskey" \
        -w /misskey \
        "${BUILD_IMAGE_TAG}" \
        node scripts/build-pre.mjs
fi

# ──────────────────────────────────────────────
# 3. Compose override: run pnpm in CI mode.
#    setup/daemon/tester/misskey services run pnpm inside non-interactive
#    containers. Passing CI=true prevents pnpm from aborting when it needs
#    to recreate node_modules and finds no TTY.
#    setup additionally uses --frozen-lockfile so the read-only lockfile
#    bind-mount is never rewritten.
# ──────────────────────────────────────────────
COMPOSE_OVERRIDE="$(mktemp --suffix=.yml)"
trap 'rm -f "${COMPOSE_OVERRIDE}"' EXIT
cat > "${COMPOSE_OVERRIDE}" <<EOF
services:
  setup:
    environment:
      - CI=true
    command: >
      bash -c "npm install -g pnpm && pnpm --filter backend --filter misskey-js --filter misskey-reversi i --frozen-lockfile"
  daemon:
    environment:
      - CI=true
  tester:
    environment:
      - CI=true
  misskey.a.test:
    environment:
      - CI=true
  misskey.b.test:
    environment:
      - CI=true
EOF
export COMPOSE_FILE="compose.yml:compose.override.yaml:${COMPOSE_OVERRIDE}"

# ──────────────────────────────────────────────
# 4. Stop running containers, then clean DB volumes.
#    Recreate redis dir with correct ownership
#    (UID 999 = redis user) so create_host_path
#    doesn't make it root-owned.
# ──────────────────────────────────────────────
echo "==> Stopping containers & cleaning DB volumes…"
docker compose down --remove-orphans >/dev/null 2>&1 || true

docker run --rm -v "${SCRIPT_DIR}/volumes:/volumes" --user root alpine:3 sh -c \
    'rm -rf /volumes/db.a /volumes/db.b /volumes/db.c && rm -rf /volumes/redis/* && mkdir -p /volumes/redis && chown 999:999 /volumes/redis'

# ──────────────────────────────────────────────
# 5. Start services in phases
# ──────────────────────────────────────────────
echo "==> Starting infrastructure (DBs, redis, setup, daemon)…"
docker compose up -d db.a.test db.b.test redis.test setup daemon
# Wait for setup to finish installing node_modules before starting misskey
echo -n "==> Waiting for setup to finish"
while docker compose ps setup --format json 2>/dev/null | grep -q '"State":"running"'; do
    echo -n "."
    sleep 2
done
echo " OK"


echo "==> Starting Misskey backends (migration may take a while)…"
# --no-deps is required because the nginx containers depend on
# misskey being healthy, but misskey won't be healthy while
# migrations are running. We start misskey without deps and
# poll until both backends are ready, then start nginx.
docker compose up -d --no-deps misskey.a.test misskey.b.test

# Poll until both misskey containers are healthy
MAX_WAIT=180  # seconds
WAITED=0
echo -n "==> Waiting for Misskey containers to become healthy"
while [[ ${WAITED} -lt ${MAX_WAIT} ]]; do
    HEALTHY_COUNT=$(docker compose ps misskey.a.test misskey.b.test --format json 2>/dev/null \
        | grep -c '"Health":"healthy"' || true)
    if [[ "${HEALTHY_COUNT}" == "2" ]]; then
        echo " OK"
        break
    fi
    echo -n "."
    sleep 5
    WAITED=$((WAITED + 5))
done

if [[ ${WAITED} -ge ${MAX_WAIT} ]]; then
    echo " TIMEOUT"
    echo "==> Misskey container status:"
    docker compose ps misskey.a.test misskey.b.test
    echo "==> Misskey logs (last 30 lines):"
    docker compose logs --tail 30 misskey.a.test
    exit 1
fi

echo "==> Starting nginx frontends…"
docker compose up -d --no-deps a.test b.test

# ──────────────────────────────────────────────
# 6. Run tests
# ──────────────────────────────────────────────
echo "==> Running federation tests…"
if [[ -n "${TEST_FILTER}" ]]; then
    docker compose run --rm tester pnpm --filter backend test:fed -- "${TEST_FILTER}"
else
    docker compose run --rm tester pnpm --filter backend test:fed
fi
