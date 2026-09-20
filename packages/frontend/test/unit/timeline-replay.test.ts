/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { anchorToDaysAgo, clampAnchor, clampDaysAgo, daysAgoToAnchor, fromYmd, nextReplayDelay, sortOldestFirst, toYmd } from '@/utility/timeline-replay.js';

describe('clampDaysAgo', () => {
	test('clamps to 1..1095', () => {
		expect(clampDaysAgo(0)).toBe(1);
		expect(clampDaysAgo(1096)).toBe(1095);
		expect(clampDaysAgo(2.9)).toBe(2);
		expect(clampDaysAgo(Number.NaN)).toBe(365);
	});
});

describe('clampAnchor', () => {
	test('clamps to [now - 1095d, now]', () => {
		const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
		expect(clampAnchor(now + 1000, now)).toBe(now);
		expect(clampAnchor(now - 2000 * 24 * 60 * 60 * 1000, now)).toBe(now - 1095 * 24 * 60 * 60 * 1000);
		expect(clampAnchor(Number.NaN, now)).toBe(daysAgoToAnchor(365, now));
	});
});

describe('nextReplayDelay', () => {
	test('returns 0 for negative gaps and clamps to cap', () => {
		expect(nextReplayDelay(2000, 1000, 1)).toBe(0);
		expect(nextReplayDelay(0, 60_000, 1, 30_000)).toBe(30_000);
		expect(nextReplayDelay(0, 60_000, 60, 30_000)).toBe(1000);
		expect(nextReplayDelay(0, 1000, 0)).toBe(1000);
	});
});

describe('sortOldestFirst', () => {
	test('orders by createdAt, then id', () => {
		const b = { id: 'b', createdAt: new Date(1000).toISOString() };
		const a = { id: 'a', createdAt: new Date(1000).toISOString() };
		const c = { id: 'c', createdAt: new Date(2000).toISOString() };
		expect(sortOldestFirst([c, b, a]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('toYmd / fromYmd', () => {
	test('rejects nonexistent dates', () => {
		expect(fromYmd('2026-02-30')).toBeNull();
		expect(fromYmd('not-a-date')).toBeNull();
	});

	test('round-trips a valid date', () => {
		const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
		const anchor = daysAgoToAnchor(30, now);
		expect(anchorToDaysAgo(anchor, now)).toBe(30);
		expect(fromYmd(toYmd(anchor))).not.toBeNull();
	});
});
