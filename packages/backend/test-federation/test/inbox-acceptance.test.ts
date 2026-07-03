import { describe, test, beforeAll } from 'vitest';
import { strictEqual } from 'assert';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, type LoginUser, sleep, resolveRemoteUser, waitNoteInTimeline } from './utils.js';

const bAdmin = await fetchAdmin('b.test');

describe('Inbox acceptance', () => {
	let bob: LoginUser;

	beforeAll(async () => {
		bob = await createAccount('b.test');
	});

	async function setInboxAcceptance(userId: string, value: 'all' | 'noRenotes' | 'none') {
		await bAdmin.client.request('admin/update-user-note-acceptance', { userId, value });
		await sleep();
	}

	test('all', async () => {
		const alice = await createAccount('a.test');
		const aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
		await setInboxAcceptance(aliceInB.id, 'all');

		const note = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		const foundNote = await waitNoteInTimeline(bob, 'a.test', true, note);
		strictEqual(foundNote, true);

		const targetNote = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		await sleep();
		const renote = (await alice.client.request('notes/create', { renoteId: targetNote.id })).createdNote;
		const foundRenote = await waitNoteInTimeline(bob, 'a.test', true, renote);
		strictEqual(foundRenote, true);
	});

	test('noRenotes', async () => {
		const alice = await createAccount('a.test');
		const aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
		await setInboxAcceptance(aliceInB.id, 'noRenotes');

		const note = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		const foundNote = await waitNoteInTimeline(bob, 'a.test', true, note);
		strictEqual(foundNote, true);

		const targetNote = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		await sleep();
		const renote = (await alice.client.request('notes/create', { renoteId: targetNote.id })).createdNote;
		const foundRenote = await waitNoteInTimeline(bob, 'a.test', false, renote);
		strictEqual(foundRenote, false);
	});

	test('none', async () => {
		const alice = await createAccount('a.test');
		const aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
		await setInboxAcceptance(aliceInB.id, 'none');

		const note = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		const foundNote = await waitNoteInTimeline(bob, 'a.test', false, note);
		strictEqual(foundNote, false);

		const targetNote = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		await sleep();
		const renote = (await alice.client.request('notes/create', { renoteId: targetNote.id })).createdNote;
		const foundRenote = await waitNoteInTimeline(bob, 'a.test', false, renote);
		strictEqual(foundRenote, false);
	});
});
