<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="800">
		<div ref="rootEl">
			<div v-if="queue > 0" :class="$style.new"><button class="_buttonPrimary" :class="$style.newButton" @click="top()">{{ i18n.ts.newNoteRecived }}</button></div>
			<div :class="$style.tl">
				<MkTimeline
					ref="tlEl" :key="listId + withRenotes + withReplies + onlyFiles"
					src="list"
					:list="listId"
					:withRenotes="withRenotes"
					:withReplies="withReplies"
					:onlyFiles="onlyFiles"
					:sound="true"
					@queue="queueUpdated"
				/>
			</div>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, watch, ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkTimeline from '@/components/MkTimeline.vue';
import { scroll } from '@/scripts/scroll.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router/supplier.js';
import * as os from '@/os.js';

const router = useRouter();

const props = defineProps<{
	listId: string;
}>();

const list = ref<Misskey.entities.UserList | null>(null);
const queue = ref(0);
const tlEl = shallowRef<InstanceType<typeof MkTimeline>>();
const rootEl = shallowRef<HTMLElement>();

const withRenotes = ref(true);
const withReplies = ref(false);
const onlyFiles = ref(false);

watch(withRenotes, fetch, { immediate: true });
watch(withReplies, fetch, { immediate: true });
watch(onlyFiles, fetch, { immediate: true });
watch(() => props.listId, fetch, { immediate: true });

async function fetch() {
	list.value = await misskeyApi('users/lists/show', {
		listId: props.listId,
	});
}

function queueUpdated(q) {
	queue.value = q;
}

function top() {
	scroll(rootEl.value, { top: 0 });
}

function settings() {
	router.push(`/my/lists/${props.listId}`);
}

const headerActions = computed(() => list.value ? [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: (ev: Event) => {
			tlEl.value?.reloadTimeline();
		},
	}, {
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			os.popupMenu([
				{
					icon: 'ti ti-settings',
					text: i18n.ts.editList,
					action: settings,
				}, {
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				}, {
					type: 'switch',
					text: i18n.ts.showRepliesToOthersInTimeline,
					ref: withReplies,
					disabled: onlyFiles,
				}, {
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
					disabled: withReplies,
				}], ev.currentTarget ?? ev.target);
		},
	}] : []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: list.value ? list.value.name : i18n.ts.lists,
	icon: 'ti ti-list',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--margin));
	}
}

.newButton {
	display: block;
	margin: var(--margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: 32px;
}

.tl {
	background: var(--bg);
	border-radius: var(--radius);
	overflow: clip;
}
</style>
