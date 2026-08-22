/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { InstancesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	allowGet: true,
	cacheSec: 60 * 60,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				softwareName: {
					type: 'string',
					optional: false, nullable: false,
				},
				color: {
					type: 'string',
					optional: false, nullable: true,
				},
				count: {
					type: 'integer',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		blocked: { type: 'boolean', nullable: true },
		notResponding: { type: 'boolean', nullable: true },
		suspended: { type: 'boolean', nullable: true },
		silenced: { type: 'boolean', nullable: true },
		federating: { type: 'boolean', nullable: true },
		subscribing: { type: 'boolean', nullable: true },
		publishing: { type: 'boolean', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps) => {
			const query = this.instancesRepository
				.createQueryBuilder('instance')
				.select('instance.softwareName', 'softwareName')
				.addSelect('COUNT(*)', 'count')
				.groupBy('instance.softwareName');

			if (typeof ps.blocked === 'boolean') {
				const meta = await this.metaService.fetch(true);
				if (ps.blocked) {
					query.andWhere(meta.blockedHosts.length === 0 ? '1=0' : 'instance.host IN (:...blocks)', { blocks: meta.blockedHosts });
				} else {
					query.andWhere(meta.blockedHosts.length === 0 ? '1=1' : 'instance.host NOT IN (:...blocks)', { blocks: meta.blockedHosts });
				}
			}

			if (typeof ps.silenced === 'boolean') {
				const meta = await this.metaService.fetch(true);
				if (ps.silenced) {
					if (meta.silencedHosts.length === 0) {
						return [];
					}
					query.andWhere('instance.host IN (:...silences)', {
						silences: meta.silencedHosts,
					});
				} else if (meta.silencedHosts.length > 0) {
					query.andWhere('instance.host NOT IN (:...silences)', {
						silences: meta.silencedHosts,
					});
				}
			}

			if (typeof ps.federating === 'boolean') {
				if (typeof ps.subscribing === 'boolean' && ps.subscribing !== ps.federating) return [];
				if (typeof ps.publishing === 'boolean' && ps.publishing !== ps.federating) return [];
				query.andWhere(ps.federating ?
					'((instance.followingCount > 0) OR (instance.followersCount > 0))' :
					'((instance.followingCount = 0) AND (instance.followersCount = 0))');
			} else {
				if (typeof ps.subscribing === 'boolean') {
					query.andWhere(ps.subscribing ?
						'instance.followersCount > 0' : 'instance.followersCount = 0');
				}

				if (typeof ps.publishing === 'boolean') {
					query.andWhere(ps.publishing ?
						'instance.followingCount > 0' : 'instance.followingCount = 0');
				}
			}

			if (typeof ps.suspended === 'boolean') {
				query.andWhere(ps.suspended ? 'instance.suspensionState != \'none\'' : 'instance.suspensionState = \'none\'');
			}

			if (typeof ps.notResponding === 'boolean') {
				query.andWhere('instance.isNotResponding = :isNotResponding', { isNotResponding: ps.notResponding });
			}

			const queryResult = await query.getRawMany<{ softwareName: string | null, count: string }>();

			return queryResult.map(row => ({
				softwareName: row.softwareName ?? 'unknown',
				count: parseInt(row.count, 10),
				color: getColor(row.softwareName),
			})).sort((a, b) => b.count - a.count);
		});
	}
}

function getColor(name: string | null): string | null {
	switch (name) {
		case 'misskey':
			return '#86b300';
		case 'sharkey':
			return '#43BBE5';
		case 'cherrypick':
			return '#ffa9c3';
		case 'mastodon':
			return '#6364FF';
		case 'pleroma':
			return '#FAA459';
		case 'akkoma':
			return '#462E7A';
		case 'firefish':
			return '#f07a5a';
		case 'iceshrimp':
			return '#9DC8C8';
		case 'calckey':
			return '#ffa9c3';
		case 'foundkey':
			return '#ff6b6b';
		case 'fedibird':
			return '#282c37';
		default:
			return null;
	}
}
