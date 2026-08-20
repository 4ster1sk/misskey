/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { DbQueue } from '@/core/QueueModule.js';
import type Logger from '@/logger.js';
import FederationChart from '@/core/chart/charts/federation.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import PerUserPvChart from '@/core/chart/charts/per-user-pv.js';
import DriveChart from '@/core/chart/charts/drive.js';
import PerUserReactionsChart from '@/core/chart/charts/per-user-reactions.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import PerUserDriveChart from '@/core/chart/charts/per-user-drive.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import { bindThis } from '@/decorators.js';
import { buildChartRetentionJobs } from '../chart-retention.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class CleanChartsProcessorService {
	private logger: Logger;

	constructor(
		private federationChart: FederationChart,
		private notesChart: NotesChart,
		private usersChart: UsersChart,
		private activeUsersChart: ActiveUsersChart,
		private instanceChart: InstanceChart,
		private perUserNotesChart: PerUserNotesChart,
		private perUserPvChart: PerUserPvChart,
		private driveChart: DriveChart,
		private perUserReactionsChart: PerUserReactionsChart,
		private perUserFollowingChart: PerUserFollowingChart,
		private perUserDriveChart: PerUserDriveChart,
		private apRequestChart: ApRequestChart,

		@Inject(DI.config)
		private config: Config,

		@Inject('queue:db')
		private dbQueue: DbQueue,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-charts');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Clean charts...');

		// DBへの同時接続を避けるためにPromise.allを使わずひとつずつ実行する
		await this.federationChart.clean();
		await this.notesChart.clean();
		await this.usersChart.clean();
		await this.activeUsersChart.clean();
		await this.instanceChart.clean();
		await this.perUserNotesChart.clean();
		await this.perUserPvChart.clean();
		await this.driveChart.clean();
		await this.perUserReactionsChart.clean();
		await this.perUserFollowingChart.clean();
		await this.perUserDriveChart.clean();
		await this.apRequestChart.clean();

		await this.enqueueRetentionCleanups();

		this.logger.succ('All charts successfully cleaned.');
	}

	@bindThis
	private async enqueueRetentionCleanups(): Promise<void> {
		const charts = [
			this.perUserNotesChart,
			this.perUserReactionsChart,
			this.instanceChart,
			this.perUserPvChart,
			this.perUserDriveChart,
			this.perUserFollowingChart,
		];

		const jobs = buildChartRetentionJobs(
			this.config.chartRetention,
			charts.map(chart => chart.getTableNames()),
		);

		for (const job of jobs) {
			await this.dbQueue.add('cleanChartRows', job, {
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
