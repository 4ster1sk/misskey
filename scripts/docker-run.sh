#!/usr/bin/env bash
# SPDX-FileCopyrightText: syuilo and misskey-project, yojo-art team
# SPDX-License-Identifier: AGPL-3.0-only
#
# Run arbitrary commands inside a clean Docker environment without touching
# the host Node/pnpm toolchain (mitigates supply-chain attacks).
# Node/pnpm versions are pinned to .node-version and package.json#packageManager.
#
# Usage:
#   ./scripts/docker-run.sh -- pnpm lint
#   ./scripts/docker-run.sh -- pnpm --filter backend test
#   ./scripts/docker-run.sh -p 3000:3000 -p 5173:5173 -- pnpm dev
#   ./scripts/docker-run.sh -- bash
#   ./scripts/docker-run.sh --clean-image -- pnpm lint   # rebuild the runtime image

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"
export REPO_ROOT

source "${REPO_ROOT}/scripts/docker-common.sh"

load_misskey_versions

BUILD_IMAGE_TAG="misskey-dev-env:${NODE_VERSION}-pnpm${PNPM_VERSION}"

# ──────────────────────────────────────────────
# Argument parsing: options before "--" are passed
# straight to `docker run`; everything after "--" is
# the command executed inside the container.
# ──────────────────────────────────────────────
CLEAN_IMAGE=0
DOCKER_RUN_ARGS=()
CMD=()
SEEN_SEP=0
for arg in "$@"; do
    if [[ "${SEEN_SEP}" == "0" ]]; then
        case "${arg}" in
            --clean-image)
                CLEAN_IMAGE=1
                continue
                ;;
            --)
                SEEN_SEP=1
                continue
                ;;
        esac
        DOCKER_RUN_ARGS+=("${arg}")
    else
        CMD+=("${arg}")
    fi
done

if [[ "${CLEAN_IMAGE}" == "1" ]]; then
    echo "==> Removing image ${BUILD_IMAGE_TAG}…"
    docker rmi "${BUILD_IMAGE_TAG}" >/dev/null 2>&1 || true
fi

if [[ ${#CMD[@]} -eq 0 ]]; then
    echo "Usage: $0 [--clean-image] [docker-run-options...] -- <command> [args...]" >&2
    echo "  e.g. $0 -- pnpm lint" >&2
    exit 1
fi

ensure_runtime_image "${BUILD_IMAGE_TAG}" "${SCRIPT_DIR}"

# Repo-specific marker: only run the ownership fix once per repo/uid.
OWN_MARKER="/tmp/misskey-docker-own-$(id -u)-$(printf '%s' "${REPO_ROOT}" | sha256sum | cut -d' ' -f1)"
if [[ ! -f "${OWN_MARKER}" ]]; then
    ensure_output_ownership "$(id -u)" "$(id -g)" \
        built \
        node_modules \
        packages/backend/built packages/backend/node_modules \
        packages/frontend/built packages/frontend/node_modules \
        packages/frontend-shared/built packages/frontend-shared/node_modules \
        packages/frontend-builder/built packages/frontend-builder/node_modules \
        packages/frontend-embed/built packages/frontend-embed/node_modules \
        packages/i18n/built packages/i18n/node_modules \
        packages/icons-subsetter/built packages/icons-subsetter/node_modules \
        packages/misskey-js/built packages/misskey-js/node_modules \
        packages/misskey-reversi/built packages/misskey-reversi/node_modules \
        packages/misskey-bubble-game/built packages/misskey-bubble-game/node_modules \
        packages/sw/built packages/sw/node_modules \
        packages-private/diagnostics-backend/built packages-private/diagnostics-backend/node_modules \
        packages-private/diagnostics-frontend/built packages-private/diagnostics-frontend/node_modules \
        packages-private/diagnostics-shared/built packages-private/diagnostics-shared/node_modules \
        packages-private/changelog-checker/built packages-private/changelog-checker/node_modules
    touch "${OWN_MARKER}"
fi

# Attach a TTY only when both stdin and stdout are interactive; piping the
# output (e.g. `docker-run.sh -- pnpm lint | tee log`) must stay TTY-less.
TTY_ARGS=()
if [[ -t 0 && -t 1 ]]; then
    TTY_ARGS=("-it")
fi

# CHOKIDAR_USEPOLLING: file watching (vite, nodemon, ...) over bind mounts
# does not always receive inotify events; polling trades some performance
# for correctness inside the container.
echo "==> Running in ${BUILD_IMAGE_TAG}: ${CMD[*]}"
docker run --rm \
    "${TTY_ARGS[@]}" \
    --user "$(id -u):$(id -g)" \
    -v "${REPO_ROOT}:/misskey" \
    -w /misskey \
    -e HOME=/tmp \
    -e PNPM_HOME=/tmp/pnpm \
    -e CI=true \
    -e CHOKIDAR_USEPOLLING=true \
    "${DOCKER_RUN_ARGS[@]}" \
    "${BUILD_IMAGE_TAG}" \
    "${CMD[@]}"
