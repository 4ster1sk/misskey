/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'vitest-mock-extended';
import type { TestingModule } from '@nestjs/testing';
import { ApNoteService } from '@/core/activitypub/models/ApNoteService.js';
import { ApImageService } from '@/core/activitypub/models/ApImageService.js';
import { ApLoggerService } from '@/core/activitypub/ApLoggerService.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { ApAudienceService } from '@/core/activitypub/ApAudienceService.js';
import { ApMentionService } from '@/core/activitypub/models/ApMentionService.js';
import { ApQuestionService } from '@/core/activitypub/models/ApQuestionService.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { DriveService } from '@/core/DriveService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { DI } from '@/di-symbols.js';
import type { MiNote } from '@/models/Note.js';
import type { MiRemoteUser } from '@/models/User.js';

// API parity: notes/create / notes/update の fileIds / mediaIds は maxItems: 16
const MAX_NOTE_ATTACHMENTS = 16;

describe('ApNoteService', () => {
	let app: TestingModule;
	let apNoteService: ApNoteService;

	const apPersonServiceMock = mockDeep<ApPersonService>();

	// 本番では DriveService.uploadFromUrl が DownloadService.downloadUrl (実HTTP取得) を呼ぶため、
	// 呼び出し回数 = 外部へのfetch回数
	const uploadFromUrl = vi.fn(async (args: { url: string; uri: string }) => ({
		id: `drivefile-${args.url}`,
		isLink: false,
		url: args.url,
		uri: args.uri,
	}));
	const noteCreate = vi.fn(async (_actor: unknown, data: { files: unknown[] }) => ({ id: 'created-note' }));
	const noteUpdate = vi.fn(async (_actor: unknown, data: { files: unknown[] }, _target: unknown, _silent: unknown) => ({ id: 'updated-note' }));

	const resolver = {
		resolve: vi.fn(async (v: unknown) => v),
		getHistory: vi.fn(() => []),
	};

	const actor = {
		id: 'actor-id',
		uri: 'https://remote.test/users/alice',
		host: 'remote.test',
		isSuspended: false,
		channelId: null,
	} as unknown as MiRemoteUser;

	const buildNote = (attachmentCount: number) => ({
		id: 'https://remote.test/notes/1',
		type: 'Note',
		attributedTo: actor.uri,
		content: '<p>test</p>',
		attachment: Array.from({ length: attachmentCount }, (_, i) => ({
			type: 'Document',
			url: `https://remote.test/media/${i}.png`,
			name: `file${i}.png`,
			sensitive: false,
		})),
		tag: [],
	});

	beforeAll(async () => {
		app = await Test.createTestingModule({
			providers: [
				ApNoteService,
				ApImageService,
				{ provide: DI.config, useValue: {} },
				{ provide: DI.meta, useValue: { cacheRemoteFiles: true, cacheRemoteSensitiveFiles: false } },
				{ provide: DI.redis, useValue: {} },
				{ provide: DI.pollsRepository, useValue: {} },
				{ provide: DI.emojisRepository, useValue: { findBy: vi.fn(async () => []) } },
				{ provide: DI.notesRepository, useValue: {} },
				{ provide: DI.channelsRepository, useValue: {} },
				{ provide: DI.driveFilesRepository, useValue: {} },
				{
					provide: DriveService,
					useValue: { uploadFromUrl },
				},
				{
					provide: IdService,
					useValue: { isSafeT: vi.fn(() => true), gen: vi.fn(() => 'generated-id') },
				},
				{
					provide: ApMfmService,
					useValue: { htmlToMfm: vi.fn(() => 'test') },
				},
				{
					provide: ApResolverService,
					useValue: { createResolver: vi.fn(async () => resolver) },
				},
				{
					provide: ApPersonService,
					useValue: apPersonServiceMock,
				},
				{
					provide: UtilityService,
					useValue: {
						extractDbHost: vi.fn(() => 'remote.test'),
						toPuny: vi.fn((h: string) => h),
						isUriLocal: vi.fn(() => false),
						isFederationAllowedUri: vi.fn(() => true),
					},
				},
				{
					provide: ApAudienceService,
					useValue: {
						parseAudience: vi.fn(async () => ({ visibility: 'public', visibleUsers: [], mentionedUsers: [] })),
					},
				},
				{
					provide: ApMentionService,
					useValue: {
						extractApMentionObjects: vi.fn(() => []),
						extractApMentions: vi.fn(async () => []),
					},
				},
				{
					provide: ApQuestionService,
					useValue: { extractPollFromQuestion: vi.fn(async () => undefined) },
				},
				{
					provide: NoteCreateService,
					useValue: {
						checkProhibitedWordsContain: vi.fn(() => false),
						create: noteCreate,
					},
				},
				{
					provide: ApLoggerService,
					useValue: {
						logger: {
							info: vi.fn(),
							debug: vi.fn(),
							warn: vi.fn(),
							error: vi.fn(),
							succ: vi.fn(),
						},
					},
				},
				{ provide: ApDbResolverService, useValue: mockDeep<ApDbResolverService>() },
			],
		})
			.useMocker((token) => {
				if (typeof token === 'function') {
					return mockDeep<typeof token>();
				}
			})
			.compile();

		apNoteService = app.get<ApNoteService>(ApNoteService);
		apPersonServiceMock.resolvePerson.mockResolvedValue(actor);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		uploadFromUrl.mockClear();
		noteCreate.mockClear();
		noteUpdate.mockClear();
		apPersonServiceMock.resolvePerson.mockClear();
	});

	describe('createNote', () => {
		test('attachmentが100件でも16件で打ち切られる', async () => {
			await apNoteService.createNote(buildNote(100) as never, actor, resolver as never);

			expect(uploadFromUrl).toHaveBeenCalledTimes(MAX_NOTE_ATTACHMENTS);
			expect(noteCreate).toHaveBeenCalledTimes(1);
			expect(noteCreate.mock.calls[0][1].files).toHaveLength(MAX_NOTE_ATTACHMENTS);
		});

		test('attachmentが上限以下なら全件取り込まれる', async () => {
			await apNoteService.createNote(buildNote(3) as never, actor, resolver as never);

			expect(uploadFromUrl).toHaveBeenCalledTimes(3);
			expect(noteCreate).toHaveBeenCalledTimes(1);
			expect(noteCreate.mock.calls[0][1].files).toHaveLength(3);
		});
	});
});
