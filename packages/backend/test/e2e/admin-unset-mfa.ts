/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { beforeAll, describe, test } from 'vitest';
import { api, failedApiCall, role, signup, successfulApiCall } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('admin/unset-mfa', () => {
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
	}, 1000 * 60 * 2);

	test('管理者が一般ユーザーのMFAを解除が成功する', async () => {
		await successfulApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: normalUser.id,
			},
			user: root,
		}, {
			status: 204,
		});
	});

	test('他の管理者が一般ユーザーのMFAを解除が成功する', async () => {
		await successfulApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: normalUser.id,
			},
			user: otherAdmin,
		}, {
			status: 204,
		});
	});

	test('管理者が自分自身のMFAを解除が成功する', async () => {
		await successfulApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: root.id,
			},
			user: root,
		}, {
			status: 204,
		});
	});

	test('他の管理者が自分自身のMFAを解除が成功する', async () => {
		await successfulApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: otherAdmin.id,
			},
			user: otherAdmin,
		}, {
			status: 204,
		});
	});

	test('管理者が他の管理者のMFAを解除すると AccessDenied エラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: otherAdmin.id,
			},
			user: root,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'cda8f8ce-89a6-4f92-8055-33bbe0c1464d',
		});
	});

	test('他の管理者が管理者のMFAを解除すると AccessDenied エラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: root.id,
			},
			user: otherAdmin,
		}, {
			status: 400,
			code: 'ACCESS_DENIED',
			id: 'cda8f8ce-89a6-4f92-8055-33bbe0c1464d',
		});
	});

	test('モデレーターがMFA解除を試みると ROLE_PERMISSION_DENIED エラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: moderatorUser.id,
			},
			user: normalUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
		});
	});

	test('一般ユーザーがMFA解除を試みると ROLE_PERMISSION_DENIED エラーになる', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: normalUser.id,
			},
			user: normalUser,
		}, {
			status: 403,
			code: 'ROLE_PERMISSION_DENIED',
			id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
		});
	});

	test('存在しないユーザーのMFAを解除は失敗する', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: '0006fhc087yi0000',
			},
			user: root,
		}, {
			status: 400,
			code: 'NO_SUCH_USER',
			id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
		});
	});

	test('ログインしていないユーザーがMFAを解除は失敗する', async () => {
		await failedApiCall({
			endpoint: 'admin/unset-mfa',
			parameters: {
				userId: normalUser.id,
			},
			user: undefined,
		}, {
			status: 401,
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
		});
	});
});
