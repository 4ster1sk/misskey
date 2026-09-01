/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, beforeAll } from 'vitest';
import { strictEqual } from 'assert';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, type LoginUser, sleep, resolveRemoteUser, uploadFile } from './utils.js';

type Host = 'a.test' | 'b.test';

const bAdmin = await fetchAdmin('b.test');

describe('Inbox acceptance', () => {
	let bob: LoginUser;

	beforeAll(async () => {
		bob = await createAccount('b.test');
	});

	async function setInboxAcceptance(userId: string, value: 'all' | 'noRenotes' | 'noSensitiveRenote' | 'none') {
		await bAdmin.client.request('admin/update-user-note-acceptance', { userId, value });
		await sleep();
	}

	function expectedFederatedUri(host: Host, note: Misskey.entities.Note): string {
		// Pure renotes are federated as Announce activities; receivers store the activity URI.
		const isPureRenote = note.renoteId != null && note.text == null && note.cw == null && (note.fileIds == null || note.fileIds.length === 0) && !note.hasPoll;
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

	test('noSensitiveRenote - normal notes are still received, only sensitive renotes are blocked', async () => {
		const alice = await createAccount('a.test');
		const aliceInB = await resolveRemoteUser('a.test', alice.id, bob);

		await bob.client.request('following/create', { userId: aliceInB.id });
		await sleep();
		await setInboxAcceptance(aliceInB.id, 'noSensitiveRenote');

		// plain note should be received
		const plainNote = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		strictEqual(await waitNoteInTimeline(bob, 'a.test', true, plainNote), true);

		// sensitive note itself should still be received (spec: non-renote is allowed)
		const sensitiveFile = await uploadFile('a.test', alice);
		await alice.client.request('drive/files/update', { fileId: sensitiveFile.id, isSensitive: true });
		const sensitiveNote = (await alice.client.request('notes/create', { text: crypto.randomUUID(), fileIds: [sensitiveFile.id] })).createdNote;
		strictEqual(await waitNoteInTimeline(bob, 'a.test', true, sensitiveNote), true);

		// non-sensitive renote should be received
		const targetNormal = (await alice.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		await sleep(500);
		const renoteNormal = (await alice.client.request('notes/create', { renoteId: targetNormal.id })).createdNote;
		strictEqual(await waitNoteInTimeline(bob, 'a.test', true, renoteNormal), true);

		// sensitive renote (fresh, not yet fetched on B) should be blocked - early AP check
		const sensitiveFile2 = await uploadFile('a.test', alice);
		await alice.client.request('drive/files/update', { fileId: sensitiveFile2.id, isSensitive: true });
		const targetSensitiveFresh = (await alice.client.request('notes/create', { text: crypto.randomUUID(), fileIds: [sensitiveFile2.id] })).createdNote;
		await sleep(500);
		const renoteSensitiveFresh = (await alice.client.request('notes/create', { renoteId: targetSensitiveFresh.id })).createdNote;
		strictEqual(await waitNoteInTimeline(bob, 'a.test', false, renoteSensitiveFresh), false);

		// sensitive renote where target is already fetched on B should also be blocked - DB check
		// sensitiveNote was already delivered to B's timeline, so B already has the target
		const renoteSensitiveFetched = (await alice.client.request('notes/create', { renoteId: sensitiveNote.id })).createdNote;
		strictEqual(await waitNoteInTimeline(bob, 'a.test', false, renoteSensitiveFetched), false);
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
