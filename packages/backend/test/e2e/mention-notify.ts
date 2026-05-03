/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import { describe, beforeAll, afterAll, test } from 'vitest';
import { api, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('mention notification', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });

		// followers可視性テストのため、bob が alice をフォロー
		await api('following/create', { userId: alice.id }, bob);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		// 後片付け
		await api('following/delete', { userId: alice.id }, bob);
	});

	/**
	 * 指定したノートに対するメンション通知が user に届いていることを確認する
	 */
	const assertMentionNotificationReceived = async (
		noteId: string,
		user: misskey.entities.SignupResponse,
		message: string,
	) => {
		const res = await api('i/notifications', {}, user);
		assert.strictEqual(res.status, 200);

		const mentionNotif = res.body.filter(n =>
			n.type === 'mention' && 'note' in n && n.note?.id === noteId,
		);
		assert.strictEqual(mentionNotif.length, 1, message);
	};

	/**
	 * 指定したノートに対する返信通知が user に届いていることを確認する
	 */
	const assertReplyNotificationReceived = async (
		noteId: string,
		user: misskey.entities.SignupResponse,
		message: string,
	) => {
		const res = await api('i/notifications', {}, user);
		assert.strictEqual(res.status, 200);

		const replyNotif = res.body.filter(n =>
			n.type === 'reply' && 'note' in n && n.note?.id === noteId,
		);
		assert.strictEqual(replyNotif.length, 1, message);
	};

	/**
	 * 指定したノートに対する通知が user に届いていないことを確認する
	 */
	const assertNoNotification = async (
		noteId: string,
		user: misskey.entities.SignupResponse,
		message: string,
	) => {
		const res = await api('i/notifications', {}, user);
		assert.strictEqual(res.status, 200);

		const leaked = res.body.filter(n =>
			'note' in n && n.note?.id === noteId,
		);
		assert.strictEqual(leaked.length, 0, message);
	};

	// ----------------------------------------------------------------
	// public
	// ----------------------------------------------------------------
	describe('public visibility', () => {
		test('@メンションで bob に通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);
			await api('notifications/mark-all-as-read', {}, carol);

			const noteRes = await api('notes/create', {
				text: `@${bob.username} hello from public`,
				visibility: 'public',
			}, alice);

			assert.strictEqual(noteRes.status, 200);
			await setTimeout(100);

			await assertMentionNotificationReceived(
				noteRes.body.createdNote.id,
				bob,
				'public投稿でメンション通知が届かなかった',
			);
		});

		test('返信(replyId付き)で bob に reply 通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);

			// bob が起点のノートを投稿
			const baseNote = await api('notes/create', {
				text: 'base note by bob',
				visibility: 'public',
			}, bob);
			assert.strictEqual(baseNote.status, 200);

			// alice が返信
			const replyRes = await api('notes/create', {
				text: 'reply from alice',
				replyId: baseNote.body.createdNote.id,
				visibility: 'public',
			}, alice);

			assert.strictEqual(replyRes.status, 200);
			await setTimeout(100);

			await assertReplyNotificationReceived(
				replyRes.body.createdNote.id,
				bob,
				'public返信でreply通知が届かなかった',
			);
		});
	});

	// ----------------------------------------------------------------
	// home
	// ----------------------------------------------------------------
	describe('home visibility', () => {
		test('@メンションで bob に通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);

			const noteRes = await api('notes/create', {
				text: `@${bob.username} hello from home`,
				visibility: 'home',
			}, alice);

			assert.strictEqual(noteRes.status, 200);
			await setTimeout(100);

			await assertMentionNotificationReceived(
				noteRes.body.createdNote.id,
				bob,
				'home投稿でメンション通知が届かなかった',
			);
		});

		test('返信(replyId付き)で bob に reply 通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);

			const baseNote = await api('notes/create', {
				text: 'base note by bob (home)',
				visibility: 'home',
			}, bob);
			assert.strictEqual(baseNote.status, 200);

			const replyRes = await api('notes/create', {
				text: 'reply from alice (home)',
				replyId: baseNote.body.createdNote.id,
				visibility: 'home',
			}, alice);

			assert.strictEqual(replyRes.status, 200);
			await setTimeout(100);

			await assertReplyNotificationReceived(
				replyRes.body.createdNote.id,
				bob,
				'home返信でreply通知が届かなかった',
			);
		});
	});

	// ----------------------------------------------------------------
	// followers
	// ----------------------------------------------------------------
	describe('followers visibility', () => {
		test('@メンションで bob(フォロワー) に通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);
			await api('notifications/mark-all-as-read', {}, carol);

			const noteRes = await api('notes/create', {
				text: `@${bob.username} hello from followers`,
				visibility: 'followers',
			}, alice);

			assert.strictEqual(noteRes.status, 200);
			await setTimeout(100);

			await assertMentionNotificationReceived(
				noteRes.body.createdNote.id,
				bob,
				'followers投稿でメンション通知が届かなかった',
			);

			// 非フォロワーの carol には届かないこと
			await assertNoNotification(
				noteRes.body.createdNote.id,
				carol,
				'followers投稿が非フォロワーに漏れた',
			);
		});

		test('返信(replyId付き)で bob(フォロワー) に reply 通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);

			const baseNote = await api('notes/create', {
				text: 'base note by bob (followers)',
				visibility: 'public',
			}, bob);
			assert.strictEqual(baseNote.status, 200);

			const replyRes = await api('notes/create', {
				text: 'reply from alice (followers)',
				replyId: baseNote.body.createdNote.id,
				visibility: 'followers',
			}, alice);

			assert.strictEqual(replyRes.status, 200);
			await setTimeout(100);

			await assertReplyNotificationReceived(
				replyRes.body.createdNote.id,
				bob,
				'followers返信でreply通知が届かなかった',
			);
		});
	});

	// ----------------------------------------------------------------
	// specified (DM)
	// ----------------------------------------------------------------
	describe('specified visibility (DM)', () => {
		test('@メンション(DM)で bob に通知が届き、対象外には漏れないこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);
			await api('notifications/mark-all-as-read', {}, carol);

			const noteRes = await api('notes/create', {
				text: `@${bob.username} hello from DM`,
				visibility: 'specified',
				visibleUserIds: [bob.id],
			}, alice);

			assert.strictEqual(noteRes.status, 200);
			await setTimeout(100);

			await assertMentionNotificationReceived(
				noteRes.body.createdNote.id,
				bob,
				'DMでメンション通知が届かなかった',
			);

			// visibleUserIdsに含まれない carol には漏れないこと
			await assertNoNotification(
				noteRes.body.createdNote.id,
				carol,
				'DMが宛先外に漏れた',
			);
		});

		test('返信(replyId付き)のDMで bob に reply 通知が届くこと', async () => {
			await api('notifications/mark-all-as-read', {}, bob);

			const baseNote = await api('notes/create', {
				text: 'base note by bob (for DM reply)',
				visibility: 'public',
			}, bob);
			assert.strictEqual(baseNote.status, 200);

			const replyRes = await api('notes/create', {
				text: 'reply from alice (DM)',
				replyId: baseNote.body.createdNote.id,
				visibility: 'specified',
				visibleUserIds: [bob.id],
			}, alice);

			assert.strictEqual(replyRes.status, 200);
			await setTimeout(100);

			await assertReplyNotificationReceived(
				replyRes.body.createdNote.id,
				bob,
				'DM返信でreply通知が届かなかった',
			);
		});
	});
});
