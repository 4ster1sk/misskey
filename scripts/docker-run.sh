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

NODE_VERSION="$(cat "${REPO_ROOT}/.node-version")"
export NODE_VERSION

# Pin the pnpm version to the one declared in packageManager so the lockfile
# is not rewritten just because the image has a newer pnpm.
PNPM_VERSION="$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' "${REPO_ROOT}/package.json")"
if [[ -z "${PNPM_VERSION}" ]]; then
    PNPM_VERSION="latest"
fi

BUILD_IMAGE_TAG="misskey-dev-env:${NODE_VERSION}-pnpm${PNPM_VERSION}"

ensure_runtime_image() {
    if docker image inspect "${BUILD_IMAGE_TAG}" >/dev/null 2>&1; then
        return 0
    fi
    echo "==> Building runtime image ${BUILD_IMAGE_TAG} (pnpm ${PNPM_VERSION})…"
    # Pass the Dockerfile via stdin instead of writing a temp file —
    # no mktemp/trap/cleanup needed.
    docker build \
        --build-arg NODE_VERSION="${NODE_VERSION}" \
        -t "${BUILD_IMAGE_TAG}" \
        -f - \
        "${SCRIPT_DIR}" <<EOF
ARG NODE_VERSION=${NODE_VERSION}
FROM node:\${NODE_VERSION}-trixie
RUN apt-get update \\
    && apt-get install -y --no-install-recommends ffmpeg \\
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /misskey
EOF
}

# Ensure build output directories are owned by the host user. Previous
# container runs may have created them as root, causing EACCES when a
# command (which runs as the host user) tries to write there.
ensure_ownership() {
    local repo_id
    repo_id="$(printf '%s' "${REPO_ROOT}" | sha256sum | cut -d' ' -f1)"
    local marker="/tmp/misskey-docker-own-$(id -u)-${repo_id}"
    if [[ -f "${marker}" ]]; then
        return 0
    fi
    echo "==> Ensuring build directories are owned by uid=$(id -u)…"
    docker run --rm \
        --user root \
        -e HOST_UID="$(id -u)" \
        -e HOST_GID="$(id -g)" \
        -v "${REPO_ROOT}:/misskey" \
        alpine:3 \
        sh -c 'mkdir -p /misskey/built /misskey/node_modules; chown -R "$HOST_UID:$HOST_GID" /misskey/built /misskey/node_modules; for d in /misskey/packages/*/ /misskey/packages-private/*/; do [ -d "$d" ] || continue; mkdir -p "${d}node_modules" "${d}built"; chown -R "$HOST_UID:$HOST_GID" "${d}node_modules" "${d}built"; done'
    touch "${marker}"
}

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

ensure_runtime_image
ensure_ownership

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
