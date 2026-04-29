import assert, { deepStrictEqual, strictEqual } from 'node:assert';
import * as Misskey from 'misskey-js';
import { describe, test, beforeAll } from 'vitest';
import { createAccount, fetchAdmin, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep } from './utils.js';

describe('whitelist federation', () => {
	let alice: LoginUser, bob: LoginUser;
	let aliceInBobHost: Misskey.entities.UserDetailedNotMe;
	let bAdmin: LoginUser;

	beforeAll(async () => {
		[alice, bob] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
		]);

		[aliceInBobHost] = await Promise.all([
			resolveRemoteUser('a.test', alice.id, bob),
		]);
		await bob.client.request('following/create', { userId: aliceInBobHost.id });
		bAdmin = await fetchAdmin('b.test');
		await sleep();
	});
	// ホワイトリスト制かつどこも許可していないので、alice@a.testからのメッセージは1つも届かないはず
	describe('enable whitelist-federation', () => {
		beforeAll(async () => {
			await bAdmin.client.request('admin/update-meta', { federation: 'specified', federationHosts: [] });
			await sleep();
			const bMeta = await bAdmin.client.request('admin/meta', {});
			strictEqual(bMeta.federation, 'specified');
			strictEqual(bMeta.federationHosts.length, 0);
		});
		test('note', async () => {
			await alice.client.request('notes/create', { text: 'I am Alice!' });
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, 0, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from([])));
		});
		test('note(mention)', async () => {
			await alice.client.request('notes/create', { text: `@${bob.username}@b.test Mention Test` });
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, 0, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from([])));
		});
		test('note(reply)', async () => {
			const bobPublicNote = (await bob.client.request('notes/create', { text: 'Hello' })).createdNote;
			await sleep();
			const resolvedNote = await resolveRemoteNote('b.test', bobPublicNote.id, alice);
			await alice.client.request('notes/create', { text: `@${bob.username}@b.test Reply Test`, replyId: resolvedNote.id });
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, 0, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from([]).reverse()));
		});
	});

	describe('add whitelist-federation server(a.test)', () => {
		let alicePublicNote: Misskey.entities.Note, aliceMentionNote: Misskey.entities.Note;
		const expected :{ text: string | null, createdAt: string }[] = [];
		beforeAll(async () => {
			await bAdmin.client.request('admin/update-meta', { federation: 'specified', federationHosts: ['a.test'] });
			await sleep();

			const bMeta = await bAdmin.client.request('admin/meta', {});
			strictEqual(bMeta.federation, 'specified');
			strictEqual(bMeta.federationHosts.length, 1);
		});
		test('note', async () => {
			alicePublicNote = (await alice.client.request('notes/create', { text: 'I am Alice!' })).createdNote;
			expected.push({
				text: alicePublicNote.text,
				createdAt: alicePublicNote.createdAt,
			});
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('note(mention)', async () => {
			aliceMentionNote = (await alice.client.request('notes/create', { text: `@${bob.username}@b.test Mention Test` })).createdNote;
			expected.push({
				text: aliceMentionNote.text,
				createdAt: aliceMentionNote.createdAt,
			});
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('note(reply)', async () => {
			const bobPublicNote = (await bob.client.request('notes/create', { text: 'Hello' })).createdNote;
			await sleep();
			const resolvedNote = await resolveRemoteNote('b.test', bobPublicNote.id, alice);
			const aliceReplyNote = (await alice.client.request('notes/create', { text: `@${bob.username}@b.test Reply Test`, replyId: resolvedNote.id })).createdNote;

			expected.push({
				text: aliceReplyNote.text,
				createdAt: aliceReplyNote.createdAt,
			});
			await sleep();

			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
	});
});
