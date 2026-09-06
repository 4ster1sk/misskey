/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const REPLAY_MIN_DAYS_AGO = 1;
export const REPLAY_MAX_DAYS_AGO = 1095;
export const REPLAY_DEFAULT_DAYS_AGO = 365;
export const REPLAY_FETCH_LIMIT = 30;
export const REPLAY_INITIAL_VISIBLE_COUNT = 10;
export const REPLAY_MAX_GAP_MS = 30 * 1000;
export const REPLAY_SPEEDS = [1, 10, 60] as const;
export type ReplaySpeed = typeof REPLAY_SPEEDS[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export function clampDaysAgo(value: number): number {
	if (!Number.isFinite(value)) return REPLAY_DEFAULT_DAYS_AGO;
	return Math.min(REPLAY_MAX_DAYS_AGO, Math.max(REPLAY_MIN_DAYS_AGO, Math.floor(value)));
}

export function daysAgoToAnchor(daysAgo: number, now: number = Date.now()): number {
	return now - clampDaysAgo(daysAgo) * DAY_MS;
}

export function anchorToDaysAgo(anchor: number, now: number = Date.now()): number {
	const diffDays = Math.round((now - anchor) / DAY_MS);
	return clampDaysAgo(diffDays);
}

export function nextReplayDelay(prevMs: number, nextMs: number, speed: number, capMs: number = REPLAY_MAX_GAP_MS): number {
	const safeSpeed = speed > 0 ? speed : 1;
	const raw = (nextMs - prevMs) / safeSpeed;
	if (!Number.isFinite(raw) || raw < 0) return 0;
	return Math.min(raw, capMs);
}

export function sortOldestFirst<T extends { id: string; createdAt: string }>(notes: T[]): T[] {
	return [...notes].sort((a, b) => {
		const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
		if (t !== 0) return t;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

export function toYmd(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function fromYmd(ymd: string): number | null {
	const t = Date.parse(ymd);
	return Number.isFinite(t) ? t : null;
}
