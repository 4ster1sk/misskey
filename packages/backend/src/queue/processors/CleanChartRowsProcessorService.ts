/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { DbQueue } from '@/core/QueueModule.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { DataSource } from 'typeorm';
import type { CleanChartRowsJobData } from '../types.js';
import type * as Bull from 'bullmq';

@Injectable()
export class CleanChartRowsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject('queue:db')
		private dbQueue: DbQueue,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-chart-rows');
	}

	@bindThis
	public async process(job: Bull.Job<CleanChartRowsJobData>): Promise<void> {
		const { tableName, cutoff, batchSize } = job.data;
		// 過去のジョブデータ (lastId なし) にも対応するため undefined は 0 に丸める
		const lastId = job.data.lastId ?? 0;

		// batchSize が 0 以下の場合、LIMIT 0 の空 DELETE が無限再投入ループを
		// 引き起こすため、ここで処理を打ち切る
		if (batchSize <= 0) {
			this.logger.warn(`Skipping cleanup for "${tableName}" because batchSize is ${batchSize}`);
			return;
		}

		this.logger.info(`Cleaning rows from "${tableName}" older than ${cutoff} (batch: ${batchSize}, lastId: ${lastId})`);

		// keyset ページネーション: 前回削除した最大 id より大きい id から順に
		// batchSize 行だけ選択する。これにより各ジョブの走査コストを O(batch) に
		// 抑えられる (全残存行のスキャン + ソートが毎回発生しない)
		const rows = await this.db.createQueryBuilder()
			.select('id')
			.from(tableName, 't')
			.where('date < :cutoff', { cutoff })
			.andWhere('id > :lastId', { lastId })
			.orderBy('id')
			.limit(batchSize)
			.getRawMany<{ id: number }>();

		if (rows.length === 0) {
			this.logger.info(`No rows to delete from "${tableName}"`);
			return;
		}

		const ids = rows.map(row => row.id);

		const result = await this.db.createQueryBuilder()
			.delete()
			.from(tableName)
			.where('id IN (:...ids)', { ids })
			.execute();

		const affected = result.affected ?? 0;

		this.logger.info(`Deleted ${affected} rows from "${tableName}"`);

		// バッチが一杯だった場合のみ、次のカーソル (削除した最大 id) で次ジョブを再投入する
		if (rows.length === batchSize) {
			await this.dbQueue.add('cleanChartRows', {
				tableName,
				cutoff,
				batchSize,
				lastId: ids[ids.length - 1],
			}, {
				removeOnComplete: {
					age: 3600 * 24 * 7,
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7,
					count: 100,
				},
			});
		}
	}
}
