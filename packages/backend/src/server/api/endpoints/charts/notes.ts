/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { getJsonSchema } from '@/core/chart/core.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import NotesChart from '@/core/chart/charts/notes.js';
import { schema } from '@/core/chart/charts/entities/notes.js';
import { DI } from '@/di-symbols.js';
import { MiMeta } from '@/models/Meta.js';

export const meta = {
	tags: ['charts', 'notes'],

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
	},
	required: ['span'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,
		private notesChart: NotesChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (me == null && this.serverSettings.serverChartsAuthRequired) {
				return await this.notesChart.getEmpty(ps.span, ps.limit);
			}
			return await this.notesChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null);
		});
	}
}
