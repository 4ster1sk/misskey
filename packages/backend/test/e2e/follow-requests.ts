/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { describe, beforeAll, afterAll, test } from 'vitest';
import { Redis } from 'ioredis';
import { api, signup } from '../utils.js';
import { loadConfig } from '@/config.js';

describe('Follow requests unread flag', () => {
	let redisClient: Redis;

	beforeAll(async () => {
		redisClient = new Redis(loadConfig().redis);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		redisClient.disconnect();
	});

	test('未確認フォロー申請の unread フラグが Redis で管理される', async () => {
		const followee = await signup({ username: 'followee' });
		const follower = await signup({ username: 'follower' });

		await api('i/update', { isLocked: true }, followee);

		// 申請作成
		await api('following/create', { userId: followee.id }, follower);

		// Redis Set に followerId が追加されている
		assert.ok(await redisClient.sismember(`unreadFollowRequest:${followee.id}`, follower.id));

		// /i では未確認と判定される
		const i1 = await api('i', {}, followee);
		assert.strictEqual(i1.body.hasUnreadFollowRequest, true);
		assert.strictEqual(i1.body.hasPendingReceivedFollowRequest, true);

		// 既読にする
		await api('following/requests/mark-as-read', {}, followee);

		// Redis Set が削除され、既読マーカーが設定されている
		assert.strictEqual(await redisClient.exists(`unreadFollowRequest:${followee.id}`), 0);
		assert.strictEqual(await redisClient.exists(`readFollowRequest:${followee.id}`), 1);

		// /i では未確認でなくなる
		const i2 = await api('i', {}, followee);
		assert.strictEqual(i2.body.hasUnreadFollowRequest, false);
		assert.strictEqual(i2.body.hasPendingReceivedFollowRequest, true); // DB 残件は維持

		// 新規申請で再点灯
		const follower2 = await signup({ username: 'follower2' });
		await api('following/create', { userId: followee.id }, follower2);

		const i3 = await api('i', {}, followee);
		assert.strictEqual(i3.body.hasUnreadFollowRequest, true);

		// 受理で消灯
		await api('following/requests/accept', { userId: follower2.id }, followee);

		const i4 = await api('i', {}, followee);
		assert.strictEqual(i4.body.hasUnreadFollowRequest, false);
	});

	test('Redis キーが消失していても DB 残件があれば未読扱いになる', async () => {
		const followee = await signup({ username: 'followee_fallback' });
		const follower = await signup({ username: 'follower_fallback' });

		await api('i/update', { isLocked: true }, followee);
		await api('following/create', { userId: followee.id }, follower);

		// Redis キーを手動で削除（flush やキー失効を模擬）
		await redisClient.del(`unreadFollowRequest:${followee.id}`);
		await redisClient.del(`readFollowRequest:${followee.id}`);

		// DB 残件があるため fail-closed で未読扱い
		const i = await api('i', {}, followee);
		assert.strictEqual(i.body.hasUnreadFollowRequest, true);
	});
});
