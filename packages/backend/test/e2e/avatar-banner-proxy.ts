/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, initTestDb, randomString, signup, simpleGet, successfulApiCall, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';
import type { DataSource, Repository } from 'typeorm';
import { loadConfig } from '@/config.js';
import { MiUser } from '@/models/User.js';
import { MiDriveFile } from '@/models/DriveFile.js';

// DBには元のURLを保存し、APIで返すときにメディアプロキシのURLを付与することを確認する
describe('アバター/バナーURLのメディアプロキシ', () => {
	const config = loadConfig();

	let connection: DataSource;
	let usersRepository: Repository<MiUser>;
	let driveFilesRepository: Repository<MiDriveFile>;

	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;

	async function rawUrlOf(fileId: string): Promise<string> {
		const file = await driveFilesRepository.findOneByOrFail({ id: fileId });
		return file.webpublicUrl ?? file.url;
	}

	function assertAvatarProxyUrl(actual: string | null | undefined, originalUrl: string): void {
		assert.ok(actual, 'URLが返される');
		const url = new URL(actual);
		assert.strictEqual(`${url.origin}${url.pathname}`, `${config.mediaProxy}/avatar.webp`);
		assert.strictEqual(url.searchParams.get('url'), originalUrl);
		assert.strictEqual(url.searchParams.get('avatar'), '1');
	}

	function assertBannerProxyUrl(actual: string | null | undefined, originalUrl: string): void {
		assert.ok(actual, 'URLが返される');
		const url = new URL(actual);
		assert.strictEqual(`${url.origin}${url.pathname}`, `${config.mediaProxy}/image.webp`);
		assert.strictEqual(url.searchParams.get('url'), originalUrl);
	}

	beforeAll(async () => {
		connection = await initTestDb(true);
		usersRepository = connection.getRepository(MiUser);
		driveFilesRepository = connection.getRepository(MiDriveFile);

		root = await signup({ username: 'root' });
		alice = await signup({ username: 'alice' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await connection.destroy();
	});

	describe('i/update', () => {
		test('アバターはDBに元のURLで保存され、APIではアバター用プロキシURLで返る', async () => {
			const file = (await uploadFile(alice)).body!;
			const response = await successfulApiCall({ endpoint: 'i/update', parameters: { avatarId: file.id }, user: alice });
			const rawUrl = await rawUrlOf(file.id);

			const stored = await usersRepository.findOneByOrFail({ id: alice.id });
			assert.strictEqual(stored.avatarUrl, rawUrl);
			assertAvatarProxyUrl(response.avatarUrl, rawUrl);

			const shown = await successfulApiCall({ endpoint: 'users/show', parameters: { userId: alice.id }, user: root });
			assert.strictEqual(shown.avatarUrl, response.avatarUrl);
		});

		test('/avatar/@username は users/show と同じアバターURLへリダイレクトする', async () => {
			const shown = await successfulApiCall({ endpoint: 'users/show', parameters: { userId: alice.id }, user: root });
			const res = await simpleGet(`/avatar/@${alice.username}`);

			assert.strictEqual(res.status, 302);
			assert.strictEqual(res.location, shown.avatarUrl);
		});

		test('ローカルユーザーのバナーはDBに元のURLで保存され、APIではプロキシURLで返る', async () => {
			const file = (await uploadFile(alice)).body!;
			const response = await successfulApiCall({ endpoint: 'i/update', parameters: { bannerId: file.id }, user: alice });
			const rawUrl = await rawUrlOf(file.id);

			const stored = await usersRepository.findOneByOrFail({ id: alice.id });
			assert.strictEqual(stored.bannerUrl, rawUrl);
			assertBannerProxyUrl(response.bannerUrl, rawUrl);
		});
	});

	describe('channels', () => {
		test('channels/create でバナーを設定するとAPIにプロキシURLが入る', async () => {
			const banner = (await uploadFile(root)).body!;
			const res = await api('channels/create', { name: randomString(), bannerId: banner.id }, root);
			assert.strictEqual(res.status, 200);

			const rawUrl = await rawUrlOf(banner.id);
			assertBannerProxyUrl(res.body.bannerUrl, rawUrl);

			const shown = await successfulApiCall({ endpoint: 'channels/show', parameters: { channelId: res.body.id }, user: root });
			assert.strictEqual(shown.bannerUrl, res.body.bannerUrl);
		});

		test('channels/update でバナーを差し替えるとAPIにプロキシURLが入る', async () => {
			const created = await api('channels/create', { name: randomString() }, root);
			assert.strictEqual(created.status, 200);

			const banner = (await uploadFile(root)).body!;
			const updated = await api('channels/update', { channelId: created.body.id, bannerId: banner.id }, root);
			assert.strictEqual(updated.status, 200);

			assertBannerProxyUrl(updated.body.bannerUrl, await rawUrlOf(banner.id));
		});
	});
});
