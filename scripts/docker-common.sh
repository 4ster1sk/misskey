#!/usr/bin/env bash
# SPDX-FileCopyrightText: syuilo and misskey-project, yojo-art team
# SPDX-License-Identifier: AGPL-3.0-only
#
# Shared helpers for the Misskey Docker runners (scripts/docker-run.sh and
# packages/backend/test-federation/run-local-docker.sh).
# This file defines functions only; it must be sourced, not executed.
#
# Usage:
#   source "${REPO_ROOT}/scripts/docker-common.sh"

# ──────────────────────────────────────────────
# Version resolution: read .node-version and package.json#packageManager.
# Sets NODE_VERSION and PNPM_VERSION (globals).
# Requires: REPO_ROOT to be set and exported by the caller.
# ──────────────────────────────────────────────
load_misskey_versions() {
    NODE_VERSION="$(cat "${REPO_ROOT}/.node-version")"
    export NODE_VERSION

    # Pin the pnpm version to the one declared in packageManager so the
    # lockfile is not rewritten just because the image has a newer pnpm.
    PNPM_VERSION="$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' "${REPO_ROOT}/package.json")"
    if [[ -z "${PNPM_VERSION}" ]]; then
        echo "ERROR: cannot determine pnpm version from package.json#packageManager" >&2
        exit 1
    fi
}

# ──────────────────────────────────────────────
# Build (once) and cache the runtime image used by the callers.
# Both callers use the exact same base image (node + ffmpeg + pinned pnpm)
# and only differ in the image name/tag.
# ──────────────────────────────────────────────
ensure_runtime_image() {
    local image_tag="${1}"
    local build_context_dir="${2}"

    if docker image inspect "${image_tag}" >/dev/null 2>&1; then
        return 0
    fi
    echo "==> Building runtime image ${image_tag} (pnpm ${PNPM_VERSION})…"
    # Pass the Dockerfile via stdin instead of writing a temp file —
    # no mktemp/trap/cleanup needed.
    docker build \
        --build-arg NODE_VERSION="${NODE_VERSION}" \
        -t "${image_tag}" \
        -f - \
        "${build_context_dir}" <<EOF
ARG NODE_VERSION=${NODE_VERSION}
FROM node:\${NODE_VERSION}-trixie
RUN apt-get update \\
    && apt-get install -y --no-install-recommends ffmpeg \\
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /misskey
EOF
}

# ──────────────────────────────────────────────
# Ensure build output directories are owned by the host user. Previous
# container runs may have created them as root, causing EACCES when a
# command (which runs as the host user) tries to write there.
# Takes absolute directory paths (inside the repo) to create and chown.
# Requires: HOST_UID / HOST_GID (or id -u / id -g fallback).
# ──────────────────────────────────────────────
ensure_output_ownership() {
    local host_uid="${1}"
    local host_gid="${2}"
    shift 2
    local dir

    if [[ -z "${host_uid}" || -z "${host_gid}" ]]; then
        host_uid="$(id -u)"
        host_gid="$(id -g)"
    fi
    echo "==> Ensuring build directories are owned by uid=${host_uid}…"
    docker run --rm \
        --user root \
        -e HOST_UID="${host_uid}" \
        -e HOST_GID="${host_gid}" \
        -v "${REPO_ROOT}:/misskey" \
        alpine:3 \
        sh -c 'for dir in "$@"; do mkdir -p "/misskey/${dir}"; chown -R "$HOST_UID:$HOST_GID" "/misskey/${dir}"; done' \
        sh "$@"
}
