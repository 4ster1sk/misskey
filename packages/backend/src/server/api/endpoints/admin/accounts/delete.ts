/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:account',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '625bd9d5-0a7f-42db-9c43-58ea9b2c06a4',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'c36faf58-d3fc-493e-b090-fbc91abb2371',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private deleteAccoountService: DeleteAccountService,
		private roleService: RoleService,
	) {
			super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			if (user.isDeleted) {
				return;
			}

			if (await this.roleService.isModerator(user)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await this.deleteAccoountService.deleteAccount(user, me);
		});
	}
}
