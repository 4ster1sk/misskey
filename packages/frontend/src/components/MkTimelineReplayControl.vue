<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<div :class="$style.row">
		<i class="ti ti-history" :class="$style.icon"></i>
		<span :class="$style.label">{{ replayLabel }}</span>
		<span v-if="currentTime != null" :class="$style.time">{{ formattedTime }}</span>
	</div>
	<div :class="$style.row">
		<button
			class="_button"
			:class="$style.action"
			:aria-label="playing ? i18n.ts._timelineReplay.pause : i18n.ts._timelineReplay.play"
			:disabled="ended"
			@click="emit('togglePlay')"
		>
			<i :class="playing ? 'ti ti-player-pause' : 'ti ti-player-play'"></i>
			{{ playing ? i18n.ts._timelineReplay.pause : i18n.ts._timelineReplay.play }}
		</button>
		<button
			class="_button"
			:class="$style.action"
			:aria-label="i18n.ts._timelineReplay.skipGap"
			:disabled="ended || pendingCount === 0"
			@click="emit('skipGap')"
		>
			<i class="ti ti-player-track-next"></i>
			{{ i18n.ts._timelineReplay.skipGap }}
		</button>
		<div :class="$style.speeds" role="group" :aria-label="i18n.ts._timelineReplay.speed">
			<button
				v-for="s in speeds"
				:key="s"
				class="_button"
				:class="[$style.speed, { [$style.active]: s === speed }]"
				@click="emit('changeSpeed', s)"
			>
				{{ s }}x
			</button>
		</div>
		<button
			class="_button"
			:class="$style.action"
			:aria-label="i18n.ts._timelineReplay.stop"
			@click="emit('close')"
		>
			<i class="ti ti-x"></i>
			{{ i18n.ts._timelineReplay.stop }}
		</button>
	</div>
	<div v-if="ended" :class="$style.ended">{{ i18n.ts._timelineReplay.replayEnded }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { REPLAY_SPEEDS } from '@/utility/timeline-replay.js';

const props = defineProps<{
	playing: boolean;
	speed: number;
	currentTime: number | null;
	pendingCount: number;
	ended: boolean;
	anchor: number;
}>();

const emit = defineEmits<{
	(ev: 'togglePlay'): void;
	(ev: 'changeSpeed', speed: number): void;
	(ev: 'skipGap'): void;
	(ev: 'close'): void;
}>();

const speeds = REPLAY_SPEEDS;

const replayLabel = computed(() => {
	const date = new Date(props.anchor).toLocaleDateString();
	return i18n.tsx._timelineReplay.replayingFrom({ date });
});

const formattedTime = computed(() => {
	if (props.currentTime == null) return '';
	return new Date(props.currentTime).toLocaleString();
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 14px;
	margin-bottom: var(--MI-margin);
}

.row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.icon {
	color: var(--MI_THEME-accent);
}

.label {
	font-size: 90%;
	font-weight: 700;
}

.time {
	font-size: 85%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.action {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 6px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.speeds {
	display: inline-flex;
	gap: 4px;
	margin-left: auto;
}

.speed {
	padding: 6px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);

	&.active {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
	}
}

.ended {
	font-size: 85%;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
