<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/sounds" :label="i18n.ts.sounds" :keywords="['sounds']" icon="ti ti-music">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f50a.png" color="#ff006f">
			<SearchText>{{ i18n.ts._settings.soundsBanner }}</SearchText>
		</MkFeatureBanner>

		<SearchMarker :keywords="['mute']">
			<MkPreferenceContainer k="sound.notUseSound">
				<MkSwitch v-model="notUseSound">
					<template #label><SearchLabel>{{ i18n.ts.notUseSound }}</SearchLabel></template>
				</MkSwitch>
			</MkPreferenceContainer>
		</SearchMarker>

		<SearchMarker :keywords="['active', 'mute']">
			<MkPreferenceContainer k="sound.useSoundOnlyWhenActive">
				<MkSwitch v-model="useSoundOnlyWhenActive">
					<template #label><SearchLabel>{{ i18n.ts.useSoundOnlyWhenActive }}</SearchLabel></template>
				</MkSwitch>
			</MkPreferenceContainer>
		</SearchMarker>

		<SearchMarker :keywords="['volume', 'master']">
			<MkPreferenceContainer k="sound.masterVolume">
				<MkRange v-model="masterVolume" :min="0" :max="1" :step="0.05" :textConverter="(v) => `${Math.floor(v * 100)}%`">
					<template #label><SearchLabel>{{ i18n.ts.masterVolume }}</SearchLabel></template>
				</MkRange>
			</MkPreferenceContainer>
		</SearchMarker>

		<FormSection>
			<template #label>{{ i18n.ts.sounds }}</template>
			<div class="_gaps_s">
				<MkFolder v-for="type in operationTypes" :key="type">
					<template #label>{{ i18n.ts._sfx[type] }}</template>
					<template #suffix>{{ getSoundTypeName(sounds[type].type) }}</template>
					<Suspense>
						<template #default>
							<XSound :def="sounds[type]" @update="(res) => updated(type, res)"/>
						</template>
						<template #fallback>
							<MkLoading/>
						</template>
					</Suspense>
					<template v-if="type === 'notification'">
						<div class="_gaps_s" style="margin-top: var(--MI-margin);">
							<FormSection>
								<template #label>{{ i18n.ts._soundSettings.notificationSoundOverrides }}</template>
								<div class="_gaps_s">
									<MkFolder v-for="ov in notificationSoundOverrides" :key="ov.type">
										<template #label>{{ i18n.ts._notification._types[ov.type] }}</template>
										<template #suffix>{{ ov.sound == null ? i18n.ts._soundSettings.inheritDefaultNotificationSound : getSoundTypeName(ov.sound.type) }}</template>
										<MkSwitch v-model="ov.enabled">
											<template #label>{{ i18n.ts._soundSettings.notificationSoundOverrideEnabled }}</template>
										</MkSwitch>
										<template v-if="ov.sound != null">
											<Suspense>
												<template #default>
													<XSound :def="ov.sound" @update="(res) => updatedNotificationSound(ov.type, res)"/>
												</template>
												<template #fallback>
													<MkLoading/>
												</template>
											</Suspense>
										</template>
									</MkFolder>
								</div>
							</FormSection>
						</div>
					</template>
				</MkFolder>
			</div>
		</FormSection>

		<MkButton danger @click="reset()"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XSound from './sounds.sound.vue';
import type { Ref } from 'vue';
import type { SoundType, OperationType, MajorNotificationSoundType } from '@/utility/sound.js';
import type { SoundStore } from '@/preferences/def.js';
import { prefer } from '@/preferences.js';
import MkRange from '@/components/MkRange.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { operationTypes, majorNotificationSoundTypes } from '@/utility/sound.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkPreferenceContainer from '@/components/MkPreferenceContainer.vue';
import { PREF_DEF } from '@/preferences/def.js';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { getInitialPrefValue } from '@/preferences/manager.js';

const notUseSound = prefer.model('sound.notUseSound');
const useSoundOnlyWhenActive = prefer.model('sound.useSoundOnlyWhenActive');
const masterVolume = prefer.model('sound.masterVolume');

const sounds = ref<Record<OperationType, Ref<SoundStore>>>({
	note: prefer.r['sound.on.note'],
	noteMy: prefer.r['sound.on.noteMy'],
	notification: prefer.r['sound.on.notification'],
	reaction: prefer.r['sound.on.reaction'],
	chatMessage: prefer.r['sound.on.chatMessage'],
});

type NotificationSoundOverride = {
	type: MajorNotificationSoundType;
	enabled: Ref<boolean>;
	sound: Ref<SoundStore | null>;
};

const notificationSoundOverrides = ref<NotificationSoundOverride[]>(majorNotificationSoundTypes.map((ntype: MajorNotificationSoundType) => {
	const key: `sound.on.notification.${MajorNotificationSoundType}` = `sound.on.notification.${ntype}`;
	return {
		type: ntype,
		enabled: prefer.model(key, (v) => v != null, (v) => v ? prefer.s['sound.on.notification'] : null),
		sound: prefer.r[key],
	};
}));

function getSoundTypeName(f: SoundType): string {
	switch (f) {
		case null:
			return i18n.ts.none;
		case '_driveFile_':
			return i18n.ts._soundSettings.driveFile;
		default:
			return f;
	}
}

async function updated(type: keyof typeof sounds.value, sound: { type: SoundType; fileId?: string; fileUrl?: string; volume: number; }) {
	const v: SoundStore = sound.type === '_driveFile_' ? {
		type: sound.type,
		fileId: sound.fileId!,
		fileUrl: sound.fileUrl!,
		volume: sound.volume,
	} : {
		type: sound.type,
		volume: sound.volume,
	};

	prefer.commit(`sound.on.${type}`, v);
	sounds.value[type] = v;
}

function updatedNotificationSound(ntype: MajorNotificationSoundType, sound: { type: SoundType; fileId?: string; fileUrl?: string; volume: number; }) {
	const v: SoundStore = sound.type === '_driveFile_' ? {
		type: sound.type,
		fileId: sound.fileId!,
		fileUrl: sound.fileUrl!,
		volume: sound.volume,
	} : {
		type: sound.type,
		volume: sound.volume,
	};

	prefer.commit(`sound.on.notification.${ntype}`, v);
}

function reset() {
	for (const sound of Object.keys(sounds.value) as Array<keyof typeof sounds.value>) {
		const v = getInitialPrefValue(`sound.on.${sound}`);
		prefer.commit(`sound.on.${sound}`, v);
		sounds.value[sound] = v;
	}
	for (const ntype of majorNotificationSoundTypes) {
		prefer.commit(`sound.on.notification.${ntype}`, getInitialPrefValue(`sound.on.notification.${ntype}`));
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.sounds,
	icon: 'ti ti-music',
}));
</script>
