/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ClipsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { DI } from '@/di-symbols.js';
import { MiMeta } from '@/models/Meta.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users', 'clips'],

	description: 'Show all clips this user owns.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Clip',
		},
	},
	errors: {
		signinRequired: {
			message: 'Signin required.',
			code: 'SIGNIN_REQUIRED',
			id: 'b2407eab-9d0e-4e9b-ae79-db426e2d9784',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.clipsRepository)
		private clipsRepository: ClipsRepository,

		private clipEntityService: ClipEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (this.serverSettings.ugcVisibilityForVisitor === 'none' && me == null) {
				throw new ApiError(meta.errors.signinRequired);
			}
			const query = this.queryService.makePaginationQuery(this.clipsRepository.createQueryBuilder('clip'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('clip.userId = :userId', { userId: ps.userId })
				.andWhere('clip.isPublic = true');

			const clips = await query
				.limit(ps.limit)
				.getMany();

			return await this.clipEntityService.packMany(clips, me);
		});
	}
}
