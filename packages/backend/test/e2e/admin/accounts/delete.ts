/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, test } from 'vitest';
import { api, failedApiCall, role, signup, successfulApiCall } from '../../../utils.js';
import type * as misskey from 'misskey-js';

describe('admin/accounts/delete', () => {
	let root: misskey.entities.SignupResponse;
	let otherAdmin: misskey.entities.SignupResponse;
	let moderatorUser: misskey.entities.SignupResponse;
	let normalUser: misskey.entities.SignupResponse;
	let roleAdmin: misskey.entities.Role;
	let roleModerator: misskey.entities.Role;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		otherAdmin = await signup({ username: 'otherAdmin1' });
		normalUser = await signup({ username: 'normal1' });
		moderatorUser = await signup({ username: 'moderator1' });

		roleAdmin = await role(root, { isAdministrator: true, name: 'Admin Role' });
		roleModerator = await role(root, { isModerator: true, name: 'Moderator Role' });
		await api('admin/roles/assign', { userId: otherAdmin.id, roleId: roleAdmin.id }, root);
		await api('admin/roles/assign', { userId: moderatorUser.id, roleId: roleModerator.id }, root);
	}, 1000 * 60 * 2);

	test('管理者が一般ユーザーを削除できる', async () => {
		const target = await signup({ username: 'acct_target1' });
		await successfulApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: root,
		}, {
			status: 204,
		});
	});

	test('他の管理者が一般ユーザーを削除できる', async () => {
		const target = await signup({ username: 'acct_target2' });
		await successfulApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: otherAdmin,
		}, {
			status: 204,
		});
	});

	test('管理者が他の管理者を削除しようとするとエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: otherAdmin.id,
			},
			user: root,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		});
	});

	test('管理者がモデレーターを削除しようとするとエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: moderatorUser.id,
			},
			user: root,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		});
	});

	test('モデレーターが削除を試みると ROLE_PERMISSION_DENIED エラーになる', async () => {
		const target = await signup({ username: 'acct_target3' });
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: moderatorUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	test('一般ユーザーが削除を試みると ROLE_PERMISSION_DENIED エラーになる', async () => {
		const target = await signup({ username: 'acct_target4' });
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: normalUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
		});
	});

	test('ログインしていないユーザーが削除を試みると CREDENTIAL_REQUIRED エラーになる', async () => {
		const target = await signup({ username: 'acct_target5' });
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: undefined,
		}, {
			status: 401,
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		});
	});

	test('存在しないユーザーの削除は失敗する', async () => {
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: '0006fhc087yi0000',
			},
			user: root,
		}, {
			status: 400,
			code: 'NO_SUCH_USER',
			id: '625bd9d5-0a7f-42db-9c43-58ea9b2c06a4',
		});
	});

	test('削除済みユーザーの削除は成功する', async () => {
		const target = await signup({ username: 'acct_target6' });
		await api('admin/accounts/delete', { userId: target.id }, root);

		await successfulApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: target.id,
			},
			user: root,
		}, {
			status: 204,
		});
	});

	test('root が自分自身を削除しようとするとエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: root.id,
			},
			user: root,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		});
	});

	test('管理者が自分自身を削除しようとするとエラーになる', async () => {
		const selfDeleteAdmin = await signup({ username: 'selfDeleteAdmin' });
		await api('admin/roles/assign', { userId: selfDeleteAdmin.id, roleId: roleAdmin.id }, root);

		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: selfDeleteAdmin.id,
			},
			user: selfDeleteAdmin,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		});
	});

	test('他の管理者が自分自身を削除しようとするとエラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/accounts/delete',
			parameters: {
				userId: otherAdmin.id,
			},
			user: otherAdmin,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		});
	});
});
