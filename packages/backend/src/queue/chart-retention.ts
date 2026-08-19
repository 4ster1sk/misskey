/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';

export type ChartRetentionJobSpec = {
	tableName: string;
	cutoff: number;
	batchSize: number;
	lastId: number;
};

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * chartRetention 設定と対象チャートのテーブル名から、
 * 保持期間削除ジョブ (cleanChartRows) の投入仕様を組み立てる。
 *
 * - `hour` / `day` / `batchSize` が 0 以下の span はジョブを生成しない
 * - `cutoff` は Unix タイムスタンプ(秒)。`nowSec` はテスト用に注入可能
 */
export function buildChartRetentionJobs(
	chartRetention: Config['chartRetention'],
	tables: Array<{ hour: string; day: string }>,
	nowSec = Math.floor(Date.now() / 1000),
): ChartRetentionJobSpec[] {
	const jobs: ChartRetentionJobSpec[] = [];

	if (chartRetention.batchSize <= 0) {
		return jobs;
	}

	for (const { hour, day } of tables) {
		if (chartRetention.hour > 0) {
			jobs.push({
				tableName: hour,
				cutoff: nowSec - chartRetention.hour * SECONDS_PER_DAY,
				batchSize: chartRetention.batchSize,
				lastId: 0,
			});
		}

		if (chartRetention.day > 0) {
			jobs.push({
				tableName: day,
				cutoff: nowSec - chartRetention.day * SECONDS_PER_DAY,
				batchSize: chartRetention.batchSize,
				lastId: 0,
			});
		}
	}

	return jobs;
}
