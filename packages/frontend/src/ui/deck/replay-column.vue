<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await timeline?.reloadTimeline() }">
	<template #header>
		<i class="ti ti-history"></i>
		<span style="margin-left: 8px;">{{ column.name || i18n.ts._deck._columns.replay }}</span>
		<span v-if="replaySrcLabel" style="margin-left: 8px; font-size: 85%; opacity: 0.7;">{{ replaySrcLabel }}</span>
	</template>

	<div v-if="replayAnchor == null" :class="$style.setup">
		<div :class="$style.setupTitle">{{ i18n.ts._timelineReplay.setupTitle }}</div>
		<MkButton primary rounded @click="chooseTimeline">{{ replaySrcLabel ?? i18n.ts._timelineReplay.selectTimeline }}</MkButton>
		<MkInput v-model="replayDatetime" type="datetime-local">
			<template #label>{{ i18n.ts._timelineReplay.datetime }}</template>
		</MkInput>
		<div :class="$style.setupRow">
			<MkButton v-for="d in [7, 30, 100, 365]" :key="d" small rounded @click="applyDaysAgo(d)">{{ d }}</MkButton>
			<MkButton small primary rounded :disabled="!canStart" @click="startReplay">{{ i18n.ts._timelineReplay.start }}</MkButton>
		</div>
		<div v-if="replaySrc === 'home'" :class="$style.note">{{ i18n.ts._timelineReplay.homeTimelineNote }}</div>
	</div>
	<MkStreamingNotesTimeline
		v-else-if="replaySrc"
		ref="timeline"
		:key="replayKey"
		:src="replaySrc"
		:list="replaySrc === 'list' ? replayListId : undefined"
		:withRenotes="withRenotes"
		:withReplies="withReplies"
		:withSensitive="withSensitive"
		:onlyFiles="onlyFiles"
		:sound="true"
		:customSound="soundSetting"
		:replayAnchor="replayAnchor"
		@replayClose="replayAnchor = null"
	/>
</XColumn>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import type { BasicTimelineType } from '@/timelines.js';
import type { SoundStore } from '@/preferences/def.js';
import { removeColumn, updateColumn } from '@/deck.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userListsCache } from '@/cache.js';
import { availableBasicTimelines, hasWithReplies, isAvailableBasicTimeline, isBasicTimeline } from '@/timelines.js';
import { soundSettingsButton } from '@/ui/deck/tl-note-notification.js';
import { REPLAY_DEFAULT_DAYS_AGO, clampAnchor, daysAgoToAnchor, fromLocalDatetime, toLocalDatetime } from '@/utility/timeline-replay.js';

type ReplaySrc = BasicTimelineType | 'list';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const timeline = useTemplateRef('timeline');

const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });
const withRenotes = ref(props.column.withRenotes ?? true);
const withReplies = ref(props.column.withReplies ?? false);
const withSensitive = ref(props.column.withSensitive ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);

const replaySrc = ref<ReplaySrc | null>(props.column.replaySrc ?? null);
const replayListId = ref<string | undefined>(props.column.replayListId);
const replayListName = ref<string | undefined>(props.column.timelineNameCache ?? undefined);
const replayAnchor = ref<number | null>(null);
const replayDatetime = ref<string>(toLocalDatetime(daysAgoToAnchor(REPLAY_DEFAULT_DAYS_AGO)));

const replaySrcLabel = computed(() => {
	if (replaySrc.value == null) return null;
	if (replaySrc.value === 'list') return replayListName.value ?? i18n.ts._deck._columns.list;
	return i18n.ts._timelines[replaySrc.value];
});

const replayKey = computed(() => `${replaySrc.value ?? ''}:${replaySrc.value === 'list' ? replayListId.value ?? '' : ''}:${withRenotes.value}:${withReplies.value}:${onlyFiles.value}:${String(replayAnchor.value)}`);

const canStart = computed(() => {
	if (replaySrc.value == null) return false;
	if (replaySrc.value === 'list' && replayListId.value == null) return false;
	const t = fromLocalDatetime(replayDatetime.value);
	return t != null && t <= Date.now();
});

function applyDaysAgo(days: number) {
	replayDatetime.value = toLocalDatetime(daysAgoToAnchor(days));
}

function startReplay() {
	const parsed = fromLocalDatetime(replayDatetime.value);
	if (parsed == null || parsed > Date.now()) return;
	const anchor = clampAnchor(parsed);
	replayDatetime.value = toLocalDatetime(anchor);
	replayAnchor.value = anchor;
}

function persistSelection() {
	updateColumn(props.column.id, {
		replaySrc: replaySrc.value ?? undefined,
		replayListId: replayListId.value,
		timelineNameCache: replayListName.value,
	});
}

async function chooseTimeline() {
	const basicItems = availableBasicTimelines().map(tl => ({
		value: tl as string, label: i18n.ts._timelines[tl],
	}));
	const { canceled, result } = await os.select({
		title: i18n.ts._timelineReplay.selectTimeline,
		items: [...basicItems, { value: 'list', label: i18n.ts._deck._columns.list }],
		default: replaySrc.value ?? undefined,
	});
	if (canceled || result == null) {
		if (replaySrc.value == null) {
			removeColumn(props.column.id);
		}
		return;
	}
	if (result === 'list') {
		await chooseList();
		return;
	}
	if (!isBasicTimeline(result)) return;
	replaySrc.value = result;
	replayAnchor.value = null;
	persistSelection();
}

async function chooseList() {
	const lists = await userListsCache.fetch();
	const { canceled, result: listId } = await os.select({
		title: i18n.ts._timelineReplay.selectList,
		items: lists.map(x => ({ value: x.id, label: x.name })),
		default: replayListId.value,
	});
	if (canceled || listId == null) {
		if (replaySrc.value == null) {
			removeColumn(props.column.id);
		}
		return;
	}
	const list = lists.find(x => x.id === listId);
	replaySrc.value = 'list';
	replayListId.value = listId;
	replayListName.value = list?.name;
	replayAnchor.value = null;
	persistSelection();
}

async function restoreListName() {
	if (replaySrc.value !== 'list' || replayListId.value == null) return;
	if (replayListName.value != null) return;
	try {
		const value = await misskeyApi('users/lists/show', { listId: replayListId.value });
		replayListName.value = value.name;
		persistSelection();
	} catch {
		// 取得失敗時はラベルを汎用表示のままにする
	}
}

watch(withRenotes, v => {
	updateColumn(props.column.id, { withRenotes: v });
});

watch(withReplies, v => {
	updateColumn(props.column.id, { withReplies: v });
});

watch(withSensitive, v => {
	updateColumn(props.column.id, { withSensitive: v });
});

watch(onlyFiles, v => {
	updateColumn(props.column.id, { onlyFiles: v });
});

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

onMounted(() => {
	if (replaySrc.value != null && isBasicTimeline(replaySrc.value) && !isAvailableBasicTimeline(replaySrc.value)) {
		replaySrc.value = availableBasicTimelines()[0] ?? null;
		persistSelection();
	}
	if (replaySrc.value == null) {
		void chooseTimeline();
	} else {
		void restoreListName();
	}
});

const menu = computed<MenuItem[]>(() => {
	const menuItems: MenuItem[] = [];

	menuItems.push({
		icon: 'ti ti-history',
		text: i18n.ts._timelineReplay.changeTimeline,
		action: chooseTimeline,
	}, {
		icon: 'ti ti-bell',
		text: i18n.ts._deck.newNoteNotificationSettings,
		action: () => soundSettingsButton(soundSetting),
	}, {
		type: 'switch',
		text: i18n.ts.showRenotes,
		ref: withRenotes,
	});

	if (replaySrc.value != null && replaySrc.value !== 'list' && hasWithReplies(replaySrc.value)) {
		menuItems.push({
			type: 'switch',
			text: i18n.ts.showRepliesToOthersInTimeline,
			ref: withReplies,
			disabled: onlyFiles,
		});
	}

	menuItems.push({
		type: 'switch',
		text: i18n.ts.fileAttachedOnly,
		ref: onlyFiles,
		disabled: replaySrc.value != null && replaySrc.value !== 'list' ? hasWithReplies(replaySrc.value) ? withReplies : false : false,
	}, {
		type: 'switch',
		text: i18n.ts.withSensitive,
		ref: withSensitive,
	});

	if (replayAnchor.value != null) {
		menuItems.push({
			icon: 'ti ti-history-off',
			text: i18n.ts._timelineReplay.stop,
			action: () => {
				replayAnchor.value = null;
			},
		});
	}

	return menuItems;
});
</script>

<style lang="scss" module>
.setup {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
}

.setupTitle {
	font-size: 90%;
	font-weight: 700;
}

.setupRow {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.note {
	font-size: 85%;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
