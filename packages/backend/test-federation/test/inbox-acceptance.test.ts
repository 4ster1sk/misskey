import { strictEqual } from 'assert';
import { describe, test, beforeAll } from 'vitest';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, isFired, type LoginUser, sleep, resolveRemoteUser } from './utils.js';

const bAdmin = await fetchAdmin('b.test');

describe('Inbox acceptance', () => {
	let alice: LoginUser, bob: LoginUser;
	let aliceInB: Misskey.entities.UserDetailedNotMe;

	beforeAll(async () => {
		[alice, bob] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
		]);

		aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
	});

	async function setInboxAcceptance(value: 'all' | 'noRenotes' | 'none') {
		await bAdmin.client.request('admin/update-user-note-acceptance', { userId: aliceInB.id, value });
		await sleep(3000);
	}

	async function postAndCheckReception(
		expect: boolean,
		noteParams: Misskey.entities.NotesCreateRequest = {},
	) {
		let note: Misskey.entities.Note | undefined;
		const text = noteParams.text ?? crypto.randomUUID();
		const streamingFired = await isFired(
			'b.test', bob, 'homeTimeline',
			async () => {
				note = (await alice.client.request('notes/create', { text, ...noteParams })).createdNote;
			},
			'note', msg => msg.text === text,
		);
		strictEqual(streamingFired, expect);

		await sleep();
		const notes = await bob.client.request('notes/timeline', {});
		const noteInB = notes.filter(({ uri }) => uri === `https://a.test/notes/${note!.id}`).pop();
		strictEqual(noteInB != null, expect);
	}

	async function renoteAndCheckReception(
		expect: boolean,
	) {
		const targetNote = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		await sleep();

		let renote: Misskey.entities.Note | undefined;
		const streamingFired = await isFired(
			'b.test', bob, 'homeTimeline',
			async () => {
				renote = (await alice.client.request('notes/create', { renoteId: targetNote.id })).createdNote;
			},
			'note', msg => msg.id === renote!.id,
		);
		strictEqual(streamingFired, expect);

		await sleep();
		const notes = await bob.client.request('notes/timeline', {});
		const renoteInB = notes.filter(({ uri }) => uri === `https://a.test/notes/${renote!.id}`).pop();
		strictEqual(renoteInB != null, expect);
	}

	test('all > Receive remote followee\'s Note', async () => {
		await setInboxAcceptance('all');
		await postAndCheckReception(true);
	});

	test('all > Receive remote followee\'s Renote', async () => {
		await setInboxAcceptance('all');
		await renoteAndCheckReception(true);
	});

	test('noRenotes > Receive remote followee\'s Note', async () => {
		await setInboxAcceptance('noRenotes');
		await postAndCheckReception(true);
	});

	test('noRenotes > Don\'t receive remote followee\'s Renote', async () => {
		await setInboxAcceptance('noRenotes');
		await renoteAndCheckReception(false);
	});

	test('none > Don\'t receive remote followee\'s Note', async () => {
		await setInboxAcceptance('none');
		await postAndCheckReception(false);
	});

	test('none > Don\'t receive remote followee\'s Renote', async () => {
		await setInboxAcceptance('none');
		await renoteAndCheckReception(false);
	});
});
