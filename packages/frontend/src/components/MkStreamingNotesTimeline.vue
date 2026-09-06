<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.s.enablePullToRefresh ? MkPullToRefresh : 'div'" :refresher="() => reloadTimeline()">
	<MkTimelineReplayControl
		v-if="isReplay"
		:playing="replayPlaying"
		:speed="replaySpeed"
		:currentTime="replayCurrentTime"
		:pendingCount="replayPendingCount"
		:ended="replayEnded"
		:anchor="props.replayAnchor!"
		@togglePlay="toggleReplayPlay"
		@changeSpeed="changeReplaySpeed"
		@skipGap="skipReplayGap"
		@close="emit('replayClose')"
	/>
	<MkLoading v-if="paginator.fetching.value"/>

	<MkError v-else-if="paginator.error.value" @retry="retryTimeline()"/>

	<div v-else-if="paginator.items.value.length === 0" key="_empty_">
		<slot name="empty"><MkResult type="empty" :text="i18n.ts.noNotes"/></slot>
	</div>

	<div v-else ref="rootEl">
		<div v-if="paginator.queuedAheadItemsCount.value > 0" :class="$style.new">
			<div :class="$style.newBg1"></div>
			<div :class="$style.newBg2"></div>
			<button class="_button" :class="$style.newButton" @click="releaseQueue()"><i class="ti ti-circle-arrow-up"></i> {{ i18n.ts.newNote }}</button>
		</div>
		<component
			:is="prefer.s.animation ? TransitionGroup : 'div'"
			:class="$style.notes"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
			:moveClass="$style.transition_x_move"
			tag="div"
		>
			<template v-for="(note, i) in paginator.items.value" :key="note.id">
				<div v-if="i > 0 && isSeparatorNeeded(paginator.items.value[i -1].createdAt, note.createdAt)" :data-scroll-anchor="note.id">
					<div :class="$style.date">
						<span><i class="ti ti-chevron-up"></i> {{ getSeparatorInfo(paginator.items.value[i -1].createdAt, note.createdAt)?.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ getSeparatorInfo(paginator.items.value[i -1].createdAt, note.createdAt)?.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :class="$style.note" :note="note" :withHardMute="true"/>
				</div>
				<div v-else-if="note._shouldInsertAd_" :data-scroll-anchor="note.id">
					<MkNote :class="$style.note" :note="note" :withHardMute="true"/>
					<div :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
				<MkNote v-else :class="$style.note" :note="note" :withHardMute="true" :data-scroll-anchor="note.id"/>
			</template>
		</component>
		<button v-if="!isReplay" v-show="paginator.canFetchOlder.value" key="_more_" v-appear="prefer.s.enableInfiniteScroll ? paginator.fetchOlder : null" :disabled="paginator.fetchingOlder.value" class="_button" :class="$style.more" @click="paginator.fetchOlder">
			<div v-if="!paginator.fetchingOlder.value">{{ i18n.ts.loadMore }}</div>
			<MkLoading v-else :inline="true"/>
		</button>
	</div>
</component>
</template>

<script lang="ts" setup>
import { computed, watch, onUnmounted, provide, useTemplateRef, TransitionGroup, onMounted, shallowRef, ref, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import { getScrollContainer, scrollToTop } from '@@/js/scroll.js';
import type { BasicTimelineType } from '@/timelines.js';
import type { SoundStore } from '@/preferences/def.js';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';
import MkNote from '@/components/MkNote.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { isSeparatorNeeded, getSeparatorInfo } from '@/utility/timeline-date-separate.js';
import { Paginator } from '@/utility/paginator.js';
import MkTimelineReplayControl from '@/components/MkTimelineReplayControl.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import {
	REPLAY_FETCH_LIMIT,
	REPLAY_INITIAL_VISIBLE_COUNT,
	REPLAY_MAX_GAP_MS,
	nextReplayDelay,
	sortOldestFirst,
} from '@/utility/timeline-replay.js';

const emit = defineEmits<{
	(ev: 'replayClose'): void;
}>();

const props = withDefaults(defineProps<{
	src: BasicTimelineType | 'mentions' | 'directs' | 'list' | 'antenna' | 'channel' | 'role';
	list?: string;
	antenna?: string;
	channel?: string;
	role?: string;
	sound?: boolean;
	customSound?: SoundStore | null;
	withRenotes?: boolean;
	withReplies?: boolean;
	withSensitive?: boolean;
	onlyFiles?: boolean;
	replayAnchor?: number | null;
}>(), {
	withRenotes: true,
	withReplies: false,
	withSensitive: true,
	onlyFiles: false,
	sound: false,
	customSound: null,
	replayAnchor: null,
});

const isReplay = computed(() => props.replayAnchor != null);

provide('inTimeline', true);
provide('tl_withSensitive', computed(() => props.withSensitive));
provide(DI.inChannel, computed(() => props.src === 'channel' ? props.channel ?? null : null));

let paginator: IPaginator<Misskey.entities.Note>;

if (props.src === 'antenna') {
	paginator = markRaw(new Paginator('antennas/notes', {
		computedParams: computed(() => ({
			antennaId: props.antenna!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'home') {
	paginator = markRaw(new Paginator('notes/timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'local') {
	paginator = markRaw(new Paginator('notes/local-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'social') {
	paginator = markRaw(new Paginator('notes/hybrid-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'global') {
	paginator = markRaw(new Paginator('notes/global-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'mentions') {
	paginator = markRaw(new Paginator('notes/mentions', {
		useShallowRef: true,
	}));
} else if (props.src === 'directs') {
	paginator = markRaw(new Paginator('notes/mentions', {
		params: {
			visibility: 'specified',
		},
		useShallowRef: true,
	}));
} else if (props.src === 'list') {
	paginator = markRaw(new Paginator('notes/user-list-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			listId: props.list!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'channel') {
	paginator = markRaw(new Paginator('channels/timeline', {
		computedParams: computed(() => ({
			channelId: props.channel!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'role') {
	paginator = markRaw(new Paginator('roles/notes', {
		computedParams: computed(() => ({
			roleId: props.role!,
		})),
		useShallowRef: true,
	}));
} else {
	throw new Error('Unrecognized timeline type: ' + props.src);
}

onMounted(() => {
	if (isReplay.value) {
		startReplay();
	} else {
		paginator.init();
	}

	if (paginator.computedParams) {
		watch(paginator.computedParams, () => {
			if (isReplay.value) {
				startReplay();
			} else {
				paginator.reload();
			}
		}, { immediate: false, deep: true });
	}
});

watch(() => props.replayAnchor, () => {
	if (isReplay.value) {
		startReplay();
	} else {
		stopReplayTimer();
		paginator.reload();
	}
});

function isTop() {
	if (scrollContainer == null) return true;
	if (rootEl.value == null) return true;
	const scrollTop = scrollContainer.scrollTop;
	const tlTop = rootEl.value.offsetTop - scrollContainer.offsetTop;
	return scrollTop <= tlTop;
}

let scrollContainer: HTMLElement | null = null;

function onScrollContainerScroll() {
	if (isTop()) {
		paginator.releaseQueue();
	}
}

const rootEl = useTemplateRef('rootEl');
watch(rootEl, (el) => {
	if (el && scrollContainer == null) {
		scrollContainer = getScrollContainer(el);
		if (scrollContainer == null) return;
		scrollContainer.addEventListener('scroll', onScrollContainerScroll, { passive: true }); // ほんとはscrollendにしたいけどiosが非対応
	}
}, { immediate: true });

onUnmounted(() => {
	if (scrollContainer) {
		scrollContainer.removeEventListener('scroll', onScrollContainerScroll);
	}
});

const visibility = useDocumentVisibility();
let isPausingUpdate = false;

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		isPausingUpdate = true;
	} else { // 'visible'
		isPausingUpdate = false;
		if (isTop()) {
			releaseQueue();
		}
	}
});

let adInsertionCounter = 0;

const MIN_POLLING_INTERVAL = 1000 * 10;
const POLLING_INTERVAL =
	prefer.s.pollingInterval === 1 ? MIN_POLLING_INTERVAL * 1.5 * 1.5 :
	prefer.s.pollingInterval === 2 ? MIN_POLLING_INTERVAL * 1.5 :
	prefer.s.pollingInterval === 3 ? MIN_POLLING_INTERVAL :
	MIN_POLLING_INTERVAL;

if (!store.s.realtimeMode && !isReplay.value) {
	// TODO: 先頭のノートの作成日時が1日以上前であれば流速が遅いTLと見做してインターバルを通常より延ばす
	useInterval(async () => {
		paginator.fetchNewer({
			toQueue: !isTop() || isPausingUpdate,
		});
	}, POLLING_INTERVAL, {
		immediate: false,
		afterMounted: true,
	});

	useGlobalEvent('notePosted', (note) => {
		paginator.fetchNewer({
			toQueue: !isTop() || isPausingUpdate,
		});
	});
}

useGlobalEvent('noteDeleted', (noteId) => {
	paginator.removeItem(noteId);
});

useGlobalEvent('noteRemovedFromAntenna', (antennaId, noteId) => {
	if (props.src === 'antenna' && props.antenna === antennaId) {
		paginator.removeItem(noteId);
	}
});

function releaseQueue() {
	paginator.releaseQueue();
	scrollToTop(rootEl.value!);
}

function prepend(note: Misskey.entities.Note & MisskeyEntity) {
	adInsertionCounter++;

	if (instance.notesPerOneAd > 0 && adInsertionCounter % instance.notesPerOneAd === 0) {
		note._shouldInsertAd_ = true;
	}

	if (isTop() && !isPausingUpdate) {
		paginator.prepend(note);
	} else {
		paginator.enqueue(note);
	}

	if (props.sound && !isReplay.value) {
		if (props.customSound) {
			sound.playMisskeySfxFile(props.customSound);
		} else {
			sound.playMisskeySfx($i && (note.userId === $i.id) ? 'noteMy' : 'note');
		}
	}
}

const stream = store.s.realtimeMode ? useStream() : null;

const connections = {
	antenna: null as Misskey.IChannelConnection<Misskey.Channels['antenna']> | null,
	homeTimeline: null as Misskey.IChannelConnection<Misskey.Channels['homeTimeline']> | null,
	localTimeline: null as Misskey.IChannelConnection<Misskey.Channels['localTimeline']> | null,
	hybridTimeline: null as Misskey.IChannelConnection<Misskey.Channels['hybridTimeline']> | null,
	globalTimeline: null as Misskey.IChannelConnection<Misskey.Channels['globalTimeline']> | null,
	main: null as Misskey.IChannelConnection<Misskey.Channels['main']> | null,
	userList: null as Misskey.IChannelConnection<Misskey.Channels['userList']> | null,
	channel: null as Misskey.IChannelConnection<Misskey.Channels['channel']> | null,
	roleTimeline: null as Misskey.IChannelConnection<Misskey.Channels['roleTimeline']> | null,
};

function connectChannel() {
	if (stream == null) return;
	if (props.src === 'antenna') {
		if (props.antenna == null) return;
		connections.antenna = stream.useChannel('antenna', {
			antennaId: props.antenna,
		});
		connections.antenna.on('note', prepend);
	} else if (props.src === 'home') {
		connections.homeTimeline = stream.useChannel('homeTimeline', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
		});
		connections.main = stream.useChannel('main');
		connections.homeTimeline.on('note', prepend);
	} else if (props.src === 'local') {
		connections.localTimeline = stream.useChannel('localTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
		});
		connections.localTimeline.on('note', prepend);
	} else if (props.src === 'social') {
		connections.hybridTimeline = stream.useChannel('hybridTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
		});
		connections.hybridTimeline.on('note', prepend);
	} else if (props.src === 'global') {
		connections.globalTimeline = stream.useChannel('globalTimeline', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
		});
		connections.globalTimeline.on('note', prepend);
	} else if (props.src === 'mentions') {
		connections.main = stream.useChannel('main');
		connections.main.on('mention', prepend);
	} else if (props.src === 'directs') {
		connections.main = stream.useChannel('main');
		connections.main.on('mention', note => {
			if (note.visibility === 'specified') {
				prepend(note);
			}
		});
	} else if (props.src === 'list') {
		if (props.list == null) return;
		connections.userList = stream.useChannel('userList', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			listId: props.list,
		});
		connections.userList.on('note', prepend);
	} else if (props.src === 'channel') {
		if (props.channel == null) return;
		connections.channel = stream.useChannel('channel', {
			channelId: props.channel,
		});
		connections.channel.on('note', prepend);
	} else if (props.src === 'role') {
		if (props.role == null) return;
		connections.roleTimeline = stream.useChannel('roleTimeline', {
			roleId: props.role,
		});
		connections.roleTimeline.on('note', prepend);
	}
}

function disconnectChannel() {
	for (const key in connections) {
		const conn = connections[key as keyof typeof connections];
		if (conn != null) {
			conn.dispose();
			connections[key as keyof typeof connections] = null;
		}
	}
}

if (store.s.realtimeMode && !isReplay.value) {
	connectChannel();
}

watch(() => [props.list, props.antenna, props.channel, props.role, props.withRenotes], () => {
	if (isReplay.value) {
		startReplay();
		return;
	}
	if (store.s.realtimeMode) {
		disconnectChannel();
		connectChannel();
	}
});
watch(() => props.withSensitive, () => {
	if (isReplay.value) {
		startReplay();
	} else {
		reloadTimeline();
	}
});

onUnmounted(() => {
	stopReplayTimer();
	disconnectChannel();
});

type ReplayNote = Misskey.entities.Note & MisskeyEntity;

const replayPlaying = ref(true);
const replaySpeed = ref(1);
const replayCurrentTime = ref<number | null>(null);
const replayPendingCount = ref(0);
const replayEnded = ref(false);
let replayBuffer: ReplayNote[] = [];
let replayTimer: number | null = null;
let replayLastShownMs: number | null = null;
let replayFetching = false;
let replayRunId = 0;

function getReplayTarget(): { endpoint: keyof Misskey.Endpoints; baseParams: Record<string, unknown> } | null {
	if (props.src === 'home') {
		return { endpoint: 'notes/timeline', baseParams: { withRenotes: props.withRenotes, withFiles: props.onlyFiles ? true : undefined } };
	} else if (props.src === 'local') {
		return { endpoint: 'notes/local-timeline', baseParams: { withRenotes: props.withRenotes, withReplies: props.withReplies, withFiles: props.onlyFiles ? true : undefined } };
	} else if (props.src === 'social') {
		return { endpoint: 'notes/hybrid-timeline', baseParams: { withRenotes: props.withRenotes, withReplies: props.withReplies, withFiles: props.onlyFiles ? true : undefined } };
	} else if (props.src === 'global') {
		return { endpoint: 'notes/global-timeline', baseParams: { withRenotes: props.withRenotes, withFiles: props.onlyFiles ? true : undefined } };
	} else if (props.src === 'list') {
		if (props.list == null) return null;
		return { endpoint: 'notes/user-list-timeline', baseParams: { withRenotes: props.withRenotes, withFiles: props.onlyFiles ? true : undefined, listId: props.list } };
	} else if (props.src === 'antenna') {
		if (props.antenna == null) return null;
		return { endpoint: 'antennas/notes', baseParams: { antennaId: props.antenna } };
	} else if (props.src === 'channel') {
		if (props.channel == null) return null;
		return { endpoint: 'channels/timeline', baseParams: { channelId: props.channel } };
	} else if (props.src === 'role') {
		if (props.role == null) return null;
		return { endpoint: 'roles/notes', baseParams: { roleId: props.role } };
	}
	return null;
}

function stopReplayTimer() {
	if (replayTimer != null) {
		window.clearTimeout(replayTimer);
		replayTimer = null;
	}
}

async function startReplay() {
	const runId = ++replayRunId;
	stopReplayTimer();
	disconnectChannel();
	replayBuffer = [];
	replayEnded.value = false;
	replayFetching = false;
	replayLastShownMs = null;
	replayCurrentTime.value = props.replayAnchor ?? null;
	replayPendingCount.value = 0;
	paginator.fetching.value = true;
	paginator.error.value = false;
	paginator.items.value = [];
	paginator.canFetchOlder.value = false;

	const anchor = props.replayAnchor;
	if (anchor == null) {
		paginator.fetching.value = false;
		return;
	}

	const target = getReplayTarget();
	if (target == null) {
		// mentions/directs 等の未対応タイムラインでは空のままにせず終了状態を示す
		replayEnded.value = true;
		paginator.fetching.value = false;
		return;
	}

	try {
		const res = await misskeyApi(target.endpoint, { ...target.baseParams, sinceDate: anchor, limit: REPLAY_FETCH_LIMIT } as any) as ReplayNote[];
		if (runId !== replayRunId) return;
		const sorted = sortOldestFirst(res ?? []);
		const visible = sorted.slice(0, REPLAY_INITIAL_VISIBLE_COUNT);
		replayBuffer = sorted.slice(REPLAY_INITIAL_VISIBLE_COUNT);
		const visibleDesc = [...visible].reverse();
		if (visibleDesc.length > 0) {
			paginator.pushItems(visibleDesc);
			replayLastShownMs = Date.parse(visibleDesc[0]!.createdAt);
			replayCurrentTime.value = replayLastShownMs;
		} else if (sorted.length === 0) {
			replayEnded.value = true;
		}
		replayPendingCount.value = replayBuffer.length;
	} catch {
		if (runId !== replayRunId) return;
		paginator.error.value = true;
		paginator.fetching.value = false;
		return;
	}
	paginator.fetching.value = false;

	if (runId !== replayRunId) return;
	if (replayBuffer.length === 0 && !replayEnded.value) {
		void fetchMoreReplay(runId);
	} else {
		scheduleNextReplay(runId);
	}
}

async function fetchMoreReplay(runId: number) {
	if (replayFetching || replayEnded.value) return;
	if (runId !== replayRunId) return;
	const target = getReplayTarget();
	const sinceMs = replayLastShownMs ?? props.replayAnchor;
	if (target == null || sinceMs == null) return;
	replayFetching = true;
	try {
		const res = await misskeyApi(target.endpoint, { ...target.baseParams, sinceDate: sinceMs, limit: REPLAY_FETCH_LIMIT } as any) as ReplayNote[];
		if (runId !== replayRunId) return;
		const shownIds = new Set((paginator.items.value as ReplayNote[]).map(x => x.id));
		const sorted = sortOldestFirst(res ?? []).filter(x => !shownIds.has(x.id) && !replayBuffer.some(b => b.id === x.id));
		const lastShown = replayLastShownMs;
		const fresh = lastShown == null ? sorted : sorted.filter(x => Date.parse(x.createdAt) > lastShown || (Date.parse(x.createdAt) === lastShown && !shownIds.has(x.id)));
		if (fresh.length === 0) {
			replayEnded.value = true;
		} else {
			replayBuffer.push(...fresh);
			replayPendingCount.value = replayBuffer.length;
		}
	} catch {
		if (runId !== replayRunId) return;
		// 一過性の取得失敗を「末尾到達」と誤表示しない。再生状態を維持し、少し待って再取得する
		if (replayPlaying.value) {
			stopReplayTimer();
			replayTimer = window.setTimeout(() => {
				void fetchMoreReplay(runId);
			}, 5000);
		}
		return;
	} finally {
		replayFetching = false;
	}
	if (runId !== replayRunId) return;
	scheduleNextReplay(runId);
}

function scheduleNextReplay(runId: number) {
	stopReplayTimer();
	if (runId !== replayRunId) return;
	if (!replayPlaying.value || isPausingUpdate) return;
	if (replayBuffer.length === 0) {
		if (!replayEnded.value && !replayFetching) {
			void fetchMoreReplay(runId);
		}
		return;
	}
	const next = replayBuffer[0]!;
	const nextMs = Date.parse(next.createdAt);
	const prevMs = replayLastShownMs ?? nextMs;
	const delay = nextReplayDelay(prevMs, nextMs, replaySpeed.value, REPLAY_MAX_GAP_MS);
	replayTimer = window.setTimeout(() => {
		void showNextReplayNote(runId);
	}, delay);
}

async function showNextReplayNote(runId: number, force = false) {
	replayTimer = null;
	if (runId !== replayRunId) return;
	if (!replayPlaying.value && !force) return;
	const next = replayBuffer.shift();
	if (next == null) {
		void fetchMoreReplay(runId);
		return;
	}
	prepend(next);
	replayLastShownMs = Date.parse(next.createdAt);
	replayCurrentTime.value = replayLastShownMs;
	replayPendingCount.value = replayBuffer.length;
	if (replayBuffer.length === 0) {
		await fetchMoreReplay(runId);
	} else if (replayPlaying.value) {
		scheduleNextReplay(runId);
	}
}

function toggleReplayPlay() {
	if (replayEnded.value) return;
	replayPlaying.value = !replayPlaying.value;
	if (replayPlaying.value) {
		if (isTop()) {
			paginator.releaseQueue();
		}
		scheduleNextReplay(replayRunId);
	} else {
		stopReplayTimer();
	}
}

function changeReplaySpeed(speed: number) {
	replaySpeed.value = speed > 0 ? speed : 1;
	if (replayPlaying.value) {
		scheduleNextReplay(replayRunId);
	}
}

function skipReplayGap() {
	const runId = replayRunId;
	stopReplayTimer();
	// 一時停止中でも次の1件は表示する（自動再生は再開しない）
	void showNextReplayNote(runId, true);
}

watch(visibility, () => {
	if (!isReplay.value) return;
	if (visibility.value === 'hidden') {
		stopReplayTimer();
	} else if (replayPlaying.value) {
		if (isTop()) {
			paginator.releaseQueue();
		}
		scheduleNextReplay(replayRunId);
	}
});

function retryTimeline() {
	if (isReplay.value) {
		startReplay();
	} else {
		paginator.init();
	}
}

function reloadTimeline() {
	if (isReplay.value) {
		startReplay();
		return Promise.resolve();
	}
	return new Promise<void>((res) => {
		adInsertionCounter = 0;

		paginator.reload().then(() => {
			res();
		});
	});
}

defineExpose({
	reloadTimeline,
});
</script>

<style lang="scss" module>
.transition_x_move {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.transition_x_enterActive {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.7s cubic-bezier(0.23, 1, 0.32, 1);

	&.note,
	.note {
		/* Skip Note Rendering有効時、TransitionGroupでnoteを追加するときに一瞬がくっとなる問題を抑制する */
		content-visibility: visible !important;
	}
}

.transition_x_leaveActive {
	transition: height 0.2s cubic-bezier(0,.5,.5,1), opacity 0.2s cubic-bezier(0,.5,.5,1);
}

.transition_x_enterFrom {
	opacity: 0;
	transform: translateY(max(-64px, -100%));
}

@supports (interpolate-size: allow-keywords) {
	.transition_x_leaveTo {
		interpolate-size: allow-keywords; // heightのtransitionを動作させるために必要
		height: 0;
	}
}

.transition_x_leaveTo {
	opacity: 0;
}

.notes {
	container-type: inline-size;
	background: var(--MI_THEME-panel);
}

.note:not(:empty) {
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.new {
	--gapFill: 0.5px; // 上位ヘッダーの高さにフォントの関係などで少数が含まれると、レンダリングエンジンによっては隙間が表示されてしまうため、隙間を隠すために少しずらす

	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) - var(--gapFill));
	z-index: 1000;
	width: 100%;
	box-sizing: border-box;
	padding: calc(10px + var(--gapFill)) 0 10px 0;
}

/* 疑似progressive blur */
.newBg1, .newBg2 {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
}

.newBg1 {
	height: 100%;
	-webkit-backdrop-filter: var(--MI-blur, blur(2px));
	backdrop-filter: var(--MI-blur, blur(2px));
	mask-image: linear-gradient( /* 疑似Easing Linear Gradients */
		to top,
		rgb(0 0 0 / 0%) 0%,
		rgb(0 0 0 / 4.9%) 7.75%,
		rgb(0 0 0 / 10.4%) 11.25%,
		rgb(0 0 0 / 45%) 23.55%,
		rgb(0 0 0 / 55%) 26.45%,
		rgb(0 0 0 / 89.6%) 38.75%,
		rgb(0 0 0 / 95.1%) 42.25%,
		rgb(0 0 0 / 100%) 50%
	);
}

.newBg2 {
	height: 75%;
	-webkit-backdrop-filter: var(--MI-blur, blur(4px));
	backdrop-filter: var(--MI-blur, blur(4px));
	mask-image: linear-gradient( /* 疑似Easing Linear Gradients */
		to top,
		rgb(0 0 0 / 0%) 0%,
		rgb(0 0 0 / 4.9%) 15.5%,
		rgb(0 0 0 / 10.4%) 22.5%,
		rgb(0 0 0 / 45%) 47.1%,
		rgb(0 0 0 / 55%) 52.9%,
		rgb(0 0 0 / 89.6%) 77.5%,
		rgb(0 0 0 / 95.1%) 91.9%,
		rgb(0 0 0 / 100%) 100%
	);
}

.newButton {
	position: relative;
	display: block;
	padding: 6px 12px;
	border-radius: 999px;
	width: max-content;
	margin: auto;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 90%;

	&:hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
	}

	&:active {
		background: hsl(from var(--MI_THEME-accent) h s calc(l - 5));
	}
}

.date {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 1em;
	padding: 8px 8px;
	margin: 0 auto;
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.ad {
	padding: 8px;
	background-size: auto auto;
	background-image: repeating-linear-gradient(45deg, transparent, transparent 8px, var(--MI_THEME-bg) 8px, var(--MI_THEME-bg) 14px);
	border-bottom: solid 0.5px var(--MI_THEME-divider);

	&:empty {
		display: none;
	}
}

.more {
	display: block;
	width: 100%;
	box-sizing: border-box;
	padding: 16px;
	background: var(--MI_THEME-panel);
}
</style>
