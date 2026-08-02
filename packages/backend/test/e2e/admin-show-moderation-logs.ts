/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, test, expect } from 'vitest';
import { api, failedApiCall, role, signup, successfulApiCall } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('admin/show-moderation-logs', () => {
	let root: misskey.entities.SignupResponse;
	let otherAdmin: misskey.entities.SignupResponse;
	let moderatorUser: misskey.entities.SignupResponse;
	let normalUser: misskey.entities.SignupResponse;
	let roleAdmin: misskey.entities.Role;
	let roleModerator: misskey.entities.Role;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		otherAdmin = await signup({ username: 'otherAdmin' });
		normalUser = await signup({ username: 'normal1' });
		moderatorUser = await signup({ username: 'moderator1' });

		roleAdmin = await role(root, { isAdministrator: true, name: 'Admin Role' });
		roleModerator = await role(root, { isModerator: true, name: 'Moderator Role' });
		await api('admin/roles/assign', { userId: otherAdmin.id, roleId: roleAdmin.id }, root);
		await api('admin/roles/assign', { userId: moderatorUser.id, roleId: roleModerator.id }, root);

		// ログ生成: root と otherAdmin がそれぞれ normalUser のパスワードをリセット
		await api('admin/reset-password', { userId: normalUser.id }, root);
		await api('admin/reset-password', { userId: normalUser.id }, otherAdmin);
	}, 1000 * 60 * 2);

	test('管理者がモデレーションログを取得できる', async () => {
		const res = await successfulApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {},
			user: root,
		}, {
			status: 200,
		});

		expect(Array.isArray(res)).toBe(true);
		expect(res.length).toBeGreaterThanOrEqual(2);
		expect(res.some((log) => log.type === 'resetPassword' && log.userId === root.id)).toBe(true);
		expect(res.some((log) => log.type === 'resetPassword' && log.userId === otherAdmin.id)).toBe(true);
	});

	test('他の管理者もモデレーションログを取得できる', async () => {
		const res = await successfulApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {},
			user: otherAdmin,
		}, {
			status: 200,
		});

		expect(Array.isArray(res)).toBe(true);
		expect(res.length).toBeGreaterThanOrEqual(2);
	});

	test('userId指定で特定の管理者のログに絞り込める', async () => {
		const res = await successfulApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {
				userId: root.id,
			},
			user: root,
		}, {
			status: 200,
		});

		expect(Array.isArray(res)).toBe(true);
		expect(res.length).toBeGreaterThanOrEqual(1);
		expect(res.every((log) => log.userId === root.id)).toBe(true);
	});

	test('type指定でログを絞り込める', async () => {
		const res = await successfulApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {
				type: 'resetPassword',
			},
			user: root,
		}, {
			status: 200,
		});

		expect(Array.isArray(res)).toBe(true);
		expect(res.length).toBeGreaterThanOrEqual(2);
		expect(res.every((log) => log.type === 'resetPassword')).toBe(true);
	});

	test('存在しないuserIdを指定すると空配列が返る', async () => {
		const res = await successfulApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {
				userId: '0006fhc087yi0000',
			},
			user: root,
		}, {
			status: 200,
		});

		expect(res).toEqual([]);
	});

	test('モデレーターが取得しようとするとROLE_PERMISSION_DENIEDエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {},
			user: moderatorUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	test('一般ユーザーが取得しようとするとROLE_PERMISSION_DENIEDエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {},
			user: normalUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	test('ログインしていないユーザーが取得しようとするとCREDENTIAL_REQUIREDエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/show-moderation-logs',
			parameters: {},
			user: undefined,
		}, {
			status: 401,
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		});
	});
});
