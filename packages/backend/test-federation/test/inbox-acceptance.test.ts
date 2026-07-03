import { describe, test, beforeAll } from 'vitest';
import { strictEqual } from 'assert';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, type LoginUser, type Host, sleep, resolveRemoteUser } from './utils.js';

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

	function expectedFederatedUri(host: Host, note: Misskey.entities.Note): string {
		// Pure renotes are federated as Announce activities; receivers store the activity URI.
		const isPureRenote = note.renoteId != null && note.text == null && note.cw == null;
		return isPureRenote
			? `https://${host}/notes/${note.id}/activity`
			: `https://${host}/notes/${note.id}`;
	}

	async function waitNoteInTimeline(
		user: LoginUser,
		originHost: Host,
		expect: boolean,
		note: Misskey.entities.Note,
		timeoutMs = 10000,
	) {
		const targetUri = expectedFederatedUri(originHost, note);
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const notes = await user.client.request('notes/timeline', {});
			if (notes.some(({ uri }) => uri === targetUri)) {
				if (expect) return true;
				// 予期せず見つかった場合、false を返す（以降の wait で再判定される）
				return false;
			}
			await sleep(500);
		}
		return false;
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
