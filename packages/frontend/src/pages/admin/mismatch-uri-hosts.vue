<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkStickyContainer>
		<template #header><XHeader :tabs="headerTabs"/></template>
		<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
			<FormSuspense :p="init">
				<div class="_gaps_m">
					<div>{{ i18n.ts._mismatchUriHosts.title }}</div>
					<Sortable
						v-model="mismatchUriHosts"
						class="_gaps_m"
						:itemKey="(_, i) => i"
						:animation="150"
						:handle="'.' + $style.itemHandle"
						@start="e => e.item.classList.add('active')"
						@end="e => e.item.classList.remove('active')"
					>
						<template #item="{element,index}">
							<div :class="$style.item">
								<div :class="$style.itemHeader">
									<span :class="$style.itemHandle"><i class="ti ti-menu"/></span>
									<button class="_button" :class="$style.itemRemove" @click="remove(index)"><i class="ti ti-x"></i></button>
								</div>
								<MkInput v-model="mismatchUriHosts[index].url">
									<template #label>{{ i18n.ts._mismatchUriHosts.url }}</template>
								</MkInput>
								<MkInput v-model="mismatchUriHosts[index].uri">
									<template #label>{{ i18n.ts._mismatchUriHosts.uri }}</template>
								</MkInput>
							</div>
						</template>
					</Sortable>
					<div :class="$style.commands">
						<MkButton rounded @click="mismatchUriHosts.push({'url':'', 'uri':''})"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
						<MkButton primary rounded @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
					</div>
				</div>
			</FormSuspense>
		</MkSpacer>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref, computed } from 'vue';
import XHeader from './_header_.vue';
import * as os from '@/os.js';
import { fetchInstance, instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import FormSuspense from '@/components/form/suspense.vue';

interface IHostPair {
	url: string;
	uri: string;
}

const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));

const mismatchUriHosts = ref<IHostPair[]>([]);

async function init() {
	const meta = await misskeyApi('admin/meta');
	mismatchUriHosts.value = meta.mismatchUriHosts.map((entry: string) => {
		const [url, uri] = entry.split(',');
		return { url, uri };
	});
}

const save = async () => {
	await os.apiWithDialog('admin/update-meta', {
		mismatchUriHosts: mismatchUriHosts.value
			.map(p => `${p.url.replace(/,/g, '')},${p.uri.replace(/,/g, '')}`) });
	fetchInstance(true);
};

const remove = (index: number): void => {
	mismatchUriHosts.value.splice(index, 1);
};

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._mismatchUriHosts.title,
	icon: 'ti ti-checkbox',
}));
</script>

<style lang="scss" module>
.item {
	display: block;
	color: var(--MI_THEME-navFg);
}

.itemHeader {
	display: flex;
	margin-bottom: 8px;
	align-items: center;
}

.itemHandle {
	display: flex;
	width: 40px;
	height: 40px;
	align-items: center;
	justify-content: center;
	cursor: move;
}

.itemNumber {
	display: flex;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 14px;
	font-weight: bold;
	width: 28px;
	height: 28px;
	align-items: center;
	justify-content: center;
	border-radius: 999px;
	margin-right: 8px;
}

.itemEdit {
	width: 100%;
	max-width: 100%;
	min-width: 100%;
}

.itemRemove {
	width: 40px;
	height: 40px;
	color: var(--MI_THEME-error);
	margin-left: auto;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-X5);
	}
}

.commands {
	display: flex;
	gap: 16px;
}
</style>
