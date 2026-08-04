/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, test } from 'vitest';
import { permissions as misskeyPermissions } from 'misskey-js';
import { api, createAppToken, failedApiCall, role, signup, successfulApiCall } from '../../utils.js';
import type * as misskey from 'misskey-js';

describe('admin/queue/stats', () => {
	let root: misskey.entities.SignupResponse;
	let moderatorUser: misskey.entities.SignupResponse;
	let normalUser: misskey.entities.SignupResponse;
	let roleModerator: misskey.entities.Role;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		normalUser = await signup({ username: 'normal1' });
		moderatorUser = await signup({ username: 'moderator1' });

		roleModerator = await role(root, { isModerator: true, name: 'Moderator Role' });
		await api('admin/roles/assign', { userId: moderatorUser.id, roleId: roleModerator.id }, root);
	}, 1000 * 60 * 2);

	test('モデレーター自身のトークンでキュー統計を取得できる', async () => {
		await successfulApiCall({
			endpoint: 'admin/queue/stats',
			parameters: {},
			user: moderatorUser,
		});
	});

	test('read:admin:queue スコープのアプリトークンでキュー統計を取得できる', async () => {
		const application = await createAppToken(moderatorUser, ['read:admin:queue']);
		await successfulApiCall({
			endpoint: 'admin/queue/stats',
			parameters: {},
			user: { token: application },
		});
	});

	test('read:admin:queue 以外の read:admin パーミッションではキュー統計を取得できない', async () => {
		const adminPermissions = misskeyPermissions.filter(p => p.startsWith('read:admin:'));
		for (const permission of adminPermissions) {
			if (permission === 'read:admin:queue') continue;

			const application = await createAppToken(moderatorUser, [permission]);
			await failedApiCall({
				endpoint: 'admin/queue/stats',
				parameters: {},
				user: { token: application },
			}, {
				status: 403,
				code: 'PERMISSION_DENIED',
				id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
			});
		}
	});

	test('一般ユーザーのアプリトークンは read:admin:queue スコープでも拒否される', async () => {
		const application = await createAppToken(normalUser, ['read:admin:queue']);
		await failedApiCall({
			endpoint: 'admin/queue/stats',
			parameters: {},
			user: { token: application },
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
		});
	});

	test('ログインしていない場合は拒否される', async () => {
		await failedApiCall({
			endpoint: 'admin/queue/stats',
			parameters: {},
			user: undefined,
		}, {
			status: 401,
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		});
	});
});
