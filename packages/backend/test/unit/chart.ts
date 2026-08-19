/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeEach, afterEach, afterAll, test, vi } from 'vitest';
import * as lolex from '@sinonjs/fake-timers';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import TestChart from '@/core/chart/charts/test.js';
import TestGroupedChart from '@/core/chart/charts/test-grouped.js';
import TestUniqueChart from '@/core/chart/charts/test-unique.js';
import TestIntersectionChart from '@/core/chart/charts/test-intersection.js';
import { entity as TestChartEntity } from '@/core/chart/charts/entities/test.js';
import { entity as TestGroupedChartEntity } from '@/core/chart/charts/entities/test-grouped.js';
import { entity as TestUniqueChartEntity } from '@/core/chart/charts/entities/test-unique.js';
import { entity as TestIntersectionChartEntity } from '@/core/chart/charts/entities/test-intersection.js';
import { loadConfig } from '@/config.js';
import Logger from '@/logger.js';
import { buildChartRetentionJobs } from '@/queue/chart-retention.js';
import { CleanChartRowsProcessorService } from '@/queue/processors/CleanChartRowsProcessorService.js';
import type { DbQueue } from '@/core/QueueModule.js';
import type { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type { CleanChartRowsJobData } from '@/queue/types.js';
import type * as Bull from 'bullmq';
import type { Mocked } from 'vitest';

describe('Chart', () => {
	const config = loadConfig();

	const queueLoggerServiceMock = {
		logger: {
			createSubLogger: () => ({
				info: () => {},
				warn: () => {},
				succ: () => {},
			}),
		},
	} as unknown as QueueLoggerService;

	const makeJob = (data: CleanChartRowsJobData) => ({ data }) as unknown as Bull.Job<CleanChartRowsJobData>;

	const insertChartRows = async (n: number, dateOf: (i: number) => number): Promise<void> => {
		await db!.getRepository(TestChartEntity.hour)
			.createQueryBuilder()
			.insert()
			.values(Array.from({ length: n }, (_, i) => ({
				date: dateOf(i),
				___foo_total: 1,
				___foo_inc: 1,
				___foo_dec: 0,
			})))
			.execute();
	};

	const countChartRows = async (cutoff: number, which: 'old' | 'recent'): Promise<number> => {
		return db!.getRepository(TestChartEntity.hour)
			.createQueryBuilder()
			.where(which === 'old' ? 'date < :cutoff' : 'date >= :cutoff', { cutoff })
			.getCount();
	};

	let db: DataSource | undefined;
	const redisClient = {
		set: () => Promise.resolve('OK'),
		get: () => Promise.resolve(null),
	} as unknown as Mocked<Redis.Redis>;

	let testChart: TestChart;
	let testGroupedChart: TestGroupedChart;
	let testUniqueChart: TestUniqueChart;
	let testIntersectionChart: TestIntersectionChart;
	let clock: lolex.Clock;

	beforeEach(async () => {
		if (db) db.destroy();

		db = new DataSource({
			type: 'postgres',
			host: config.db.host,
			port: config.db.port,
			username: config.db.user,
			password: config.db.pass,
			database: config.db.db,
			extra: {
				statement_timeout: 1000 * 10,
				...config.db.extra,
			},
			synchronize: true,
			dropSchema: true,
			maxQueryExecutionTime: 300,
			entities: [
				TestChartEntity.hour, TestChartEntity.day,
				TestGroupedChartEntity.hour, TestGroupedChartEntity.day,
				TestUniqueChartEntity.hour, TestUniqueChartEntity.day,
				TestIntersectionChartEntity.hour, TestIntersectionChartEntity.day,
			],
			migrations: ['../../migration/*.js'],
		});

		await db.initialize();

		const logger = new Logger('chart'); // TODO: モックにする
		testChart = new TestChart(db, redisClient, logger);
		testGroupedChart = new TestGroupedChart(db, redisClient, logger);
		testUniqueChart = new TestUniqueChart(db, redisClient, logger);
		testIntersectionChart = new TestIntersectionChart(db, redisClient, logger);

		clock = lolex.install({
			// https://github.com/sinonjs/sinon/issues/2620
			toFake: Object.keys(lolex.timers).filter((key) => !['nextTick', 'queueMicrotask'].includes(key)) as lolex.FakeMethod[],
			now: new Date(Date.UTC(2000, 0, 1, 0, 0, 0)),
			shouldClearNativeTimers: true,
		});
	});

	afterEach(() => {
		clock.uninstall();
	});

	afterAll(async () => {
		if (db) await db.destroy();
	});

	test('Can updates', async () => {
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates (dec)', async () => {
		await testChart.decrement();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});
	});

	test('Empty chart', async () => {
		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});
	});

	test('Can updates at multiple times at same time', async () => {
		await testChart.increment();
		await testChart.increment();
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});
	});

	test('複数回saveされてもデータの更新は一度だけ', async () => {
		await testChart.increment();
		await testChart.save();
		await testChart.save();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates at different times', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 仕様上はこうなってほしいけど、実装は難しそうなのでskip
	/*
	test('Can updates at different times without save', async () => {
		await testChart.increment();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0]
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0]
			},
		});
	});
	*/

	test('Can padding', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('02:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 1],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 要求された範囲にログがひとつもない場合でもパディングできる
	test('Can padding from past range', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('05:00:00');

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [1, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	// 要求された範囲の最も古い箇所に位置するログが存在しない場合でもパディングできる
	// Issue #3190
	test('Can padding from past range 2', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('05:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset (floor time)', async () => {
		clock.tick('00:30:00');

		await testChart.increment();
		await testChart.save();

		clock.tick('01:30:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	describe('Grouped', () => {
		test('Can updates', async () => {
			await testGroupedChart.increment('alice');
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 3, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 3, null, 'alice');
			const bobChartHours = await testGroupedChart.getChart('hour', 3, null, 'bob');
			const bobChartDays = await testGroupedChart.getChart('day', 3, null, 'bob');

			assert.deepStrictEqual(aliceChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(aliceChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});
		});
	});

	describe('Unique increment', () => {
		test('Can updates', async () => {
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('bob');
			await testUniqueChart.save();

			const chartHours = await testUniqueChart.getChart('hour', 3, null);
			const chartDays = await testUniqueChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: [2, 0, 0],
			});

			assert.deepStrictEqual(chartDays, {
				foo: [2, 0, 0],
			});
		});

		describe('Intersection', () => {
			test('条件が満たされていない場合はカウントされない', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});
			});

			test('条件が満たされている場合にカウントされる', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.addB('alice');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});
			});
		});
	});

	describe('Resync', () => {
		test('Can resync', async () => {
			testChart.total = 1;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});
		});

		test('Can resync (2)', async () => {
			await testChart.increment();
			await testChart.save();

			clock.tick('01:00:00');

			testChart.total = 100;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 1, 0],
					total: [100, 1, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [100, 0, 0],
				},
			});
		});

		test('getTableNames returns correct table names', () => {
			const names = testChart.getTableNames();
			assert.strictEqual(names.hour, '__chart__test');
			assert.strictEqual(names.day, '__chart_day__test');
		});

		test('buildChartRetentionJobs builds jobs for both spans', () => {
			const nowSec = 946684800;
			const jobs = buildChartRetentionJobs(
				{ hour: 90, day: 365, batchSize: 2000 },
				[{ hour: '__chart__test', day: '__chart_day__test' }],
				nowSec,
			);

			assert.strictEqual(jobs.length, 2);
			assert.deepStrictEqual(jobs[0], {
				tableName: '__chart__test',
				cutoff: nowSec - (90 * 24 * 60 * 60),
				batchSize: 2000,
				lastId: 0,
			});
			assert.deepStrictEqual(jobs[1], {
				tableName: '__chart_day__test',
				cutoff: nowSec - (365 * 24 * 60 * 60),
				batchSize: 2000,
				lastId: 0,
			});
		});

		test('buildChartRetentionJobs skips disabled spans', () => {
			const nowSec = 946684800;
			const tables = [{ hour: '__chart__test', day: '__chart_day__test' }];

			assert.strictEqual(buildChartRetentionJobs({ hour: 0, day: 365, batchSize: 2000 }, tables, nowSec).length, 1);
			assert.strictEqual(buildChartRetentionJobs({ hour: 90, day: 0, batchSize: 2000 }, tables, nowSec).length, 1);
			assert.strictEqual(buildChartRetentionJobs({ hour: 0, day: 0, batchSize: 2000 }, tables, nowSec).length, 0);
		});

		test('buildChartRetentionJobs returns no jobs when batchSize is 0', () => {
			const jobs = buildChartRetentionJobs(
				{ hour: 90, day: 365, batchSize: 0 },
				[{ hour: '__chart__test', day: '__chart_day__test' }],
				946684800,
			);

			assert.strictEqual(jobs.length, 0);
		});

		test('cleanChartRows deletes old rows in batches and re-enqueues with next cursor', async () => {
			const nowSec = Math.floor(Date.now() / 1000);
			const cutoff = nowSec - (90 * 24 * 60 * 60);
			const tableName = '__chart__test';
			const batchSize = 2000;

			// 古い行 2500 件 (id 昇順に日付降順) + 保持対象の新しい行 3 件
			await insertChartRows(2500, (i) => cutoff - 1 - i);
			await insertChartRows(3, (i) => nowSec - i);

			const dbQueueAddMock = vi.fn().mockResolvedValue(undefined);
			const dbQueueMock = { add: dbQueueAddMock } as unknown as DbQueue;
			const processor = new CleanChartRowsProcessorService(db!, dbQueueMock, queueLoggerServiceMock);

			// 1 回目: 2000 行だけ削除され、残り 500 + 3
			await processor.process(makeJob({ tableName, cutoff, batchSize, lastId: 0 }));

			assert.strictEqual(await countChartRows(cutoff, 'old'), 500);
			assert.strictEqual(await countChartRows(cutoff, 'recent'), 3);

			// 再投入されたジョブは次のカーソル (削除した最大 id) を持っている
			assert.strictEqual(dbQueueAddMock.mock.calls.length, 1);
			const [jobName, jobData] = dbQueueAddMock.mock.calls[0];
			assert.strictEqual(jobName, 'cleanChartRows');
			assert.strictEqual(jobData.tableName, tableName);
			assert.strictEqual(jobData.cutoff, cutoff);
			assert.strictEqual(jobData.batchSize, batchSize);
			assert.ok(jobData.lastId > 0);

			// keyset が正しい: 残存する古い行の最小 id は次カーソルより大きい
			const minRemainingId = await db!.getRepository(TestChartEntity.hour)
				.createQueryBuilder()
				.select('MIN(id)', 'min')
				.where('date < :cutoff', { cutoff })
				.getRawOne<{ min: number }>();
			assert.ok(minRemainingId!.min > jobData.lastId);

			// 2 回目: 残り 500 行を削除し、バッチが満杯でないため再投入しない
			dbQueueAddMock.mockClear();
			await processor.process(makeJob({ tableName, cutoff, batchSize, lastId: jobData.lastId }));

			assert.strictEqual(await countChartRows(cutoff, 'old'), 0);
			assert.strictEqual(await countChartRows(cutoff, 'recent'), 3);
			assert.strictEqual(dbQueueAddMock.mock.calls.length, 0);
		});

		test('cleanChartRows with batchSize 0 does nothing and does not re-enqueue', async () => {
			const nowSec = Math.floor(Date.now() / 1000);
			const cutoff = nowSec - (90 * 24 * 60 * 60);

			await insertChartRows(10, (i) => cutoff - 1 - i);

			const dbQueueAddMock = vi.fn().mockResolvedValue(undefined);
			const dbQueueMock = { add: dbQueueAddMock } as unknown as DbQueue;
			const processor = new CleanChartRowsProcessorService(db!, dbQueueMock, queueLoggerServiceMock);

			await processor.process(makeJob({ tableName: '__chart__test', cutoff, batchSize: 0, lastId: 0 }));

			assert.strictEqual(await countChartRows(cutoff, 'old'), 10);
			assert.strictEqual(dbQueueAddMock.mock.calls.length, 0);
		});
	});
});
