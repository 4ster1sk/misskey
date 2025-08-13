/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { getJsonSchema } from '@/core/chart/core.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import PerUserPvChart from '@/core/chart/charts/per-user-pv.js';
import { schema } from '@/core/chart/charts/entities/per-user-pv.js';
import { CacheService } from '@/core/CacheService.js';
import { DI } from '@/di-symbols.js';
import { MiMeta } from '@/models/Meta.js';

export const meta = {
	tags: ['charts', 'users'],

	res: getJsonSchema(schema),

	allowGet: true,
	cacheSec: 60 * 60,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		span: { type: 'string', enum: ['day', 'hour'] },
		limit: { type: 'integer', minimum: 1, maximum: 500, default: 30 },
		offset: { type: 'integer', nullable: true, default: null },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['span', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,
		private cacheService: CacheService,
		private perUserPvChart: PerUserPvChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (me == null) {
				const user = await this.cacheService.findUserById(ps.userId);
				if (this.serverSettings.ugcVisibilityForVisitor === 'none') {
					return await this.perUserPvChart.getEmpty(ps.span, ps.limit);
				}

				if (this.serverSettings.ugcVisibilityForVisitor === 'local' && user.host != null) {
					return await this.perUserPvChart.getEmpty(ps.span, ps.limit);
				}
			}

			return await this.perUserPvChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null, ps.userId);
		});
	}
}
