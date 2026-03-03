<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<svg v-if="type === 'info'" :class="[$style.icon, $style.info]" viewBox="0 0 160 160">
	<path d="M80,108L80,72" pathLength="1" :class="[$style.line, $style.animLine]"/>
	<path d="M80,52L80,52" :class="[$style.line, $style.animFade]"/>
	<circle cx="80" cy="80" r="56" pathLength="1" :class="[$style.line, $style.animCircle]"/>
</svg>
<svg v-else-if="type === 'question'" :class="[$style.icon, $style.question]" viewBox="0 0 160 160">
	<path d="M80,92L79.991,84C88.799,83.98 96,76.962 96,68C96,59.038 88.953,52 79.991,52C71.03,52 64,59.038 64,68" pathLength="1" :class="[$style.line, $style.animLine]"/>
	<path d="M80,108L80,108" :class="[$style.line, $style.animFade]"/>
	<circle cx="80" cy="80" r="56" pathLength="1" :class="[$style.line, $style.animCircle]"/>
</svg>
<svg v-else-if="type === 'success'" :class="[$style.icon, $style.success]" viewBox="0 0 160 160">
	<path d="M62,80L74,92L98,68" pathLength="1" :class="[$style.line, $style.animLine]"/>
	<circle cx="80" cy="80" r="56" pathLength="1" :class="[$style.line, $style.animCircle]"/>
</svg>
<svg v-else-if="type === 'warn'" :class="[$style.icon, $style.warn]" viewBox="0 0 160 160">
	<path d="M80,64L80,88" pathLength="1" :class="[$style.line, $style.animLine]"/>
	<path d="M80,108L80,108" :class="[$style.line, $style.animFade]"/>
	<path d="M92,28L144,116C148.709,124.65 144.083,135.82 136,136L24,136C15.917,135.82 11.291,124.65 16,116L68,28C73.498,19.945 86.771,19.945 92,28Z" pathLength="1" :class="[$style.line, $style.animLine]"/>
</svg>
<svg v-else-if="type === 'error'" :class="[$style.icon, $style.error]" viewBox="0 0 160 160">
	<path d="M63,63L96,96" pathLength="1" style="--duration:0.3s;" :class="[$style.line, $style.animLine]"/>
	<path d="M96,63L63,96" pathLength="1" style="--duration:0.3s;--delay:0.2s;" :class="[$style.line, $style.animLine]"/>
	<circle cx="80" cy="80" r="56" pathLength="1" :class="[$style.line, $style.animCircle]"/>
</svg>
<svg v-else-if="type === 'waiting'" :class="[$style.icon, $style.waiting]" viewBox="0 0 160 160">
	<circle cx="80" cy="80" r="75" fill="none" stroke="currentColor" stroke-width="2" opacity="0.2"/>
	<circle cx="80" cy="80" r="56" pathLength="1" :class="[$style.line, $style.animCircleWaiting]"/>
	<circle cx="80" cy="80" r="56" style="opacity: 0.25;" :class="[$style.line]"/>
</svg>
<svg v-else-if="type === 'protect'" viewBox="0 0 24.00 24.00" fill="none" xmlns="http://www.w3.org/2000/svg">
	<g id="SVGRepo_iconCarrier">
		<path d="M3 3L21 21M17 10V8C17 5.23858 14.7614 3 12 3C11.0283 3 10.1213 3.27719 9.35386 3.75681M7.08383 7.08338C7.02878 7.38053 7 7.6869 7 8V10.0288M19.5614 19.5618C19.273 20.0348 18.8583 20.4201 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V14.8C4 13.1198 4 12.2798 4.32698 11.638C4.6146 11.0735 5.07354 10.6146 5.63803 10.327C5.99429 10.1455 6.41168 10.0647 7 10.0288M19.9998 14.4023C19.9731 12.9831 19.9731 12.227 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C17.773 10.0269 17.0169 10.0022 15.5977 10.0002M10 10H8.8C8.05259 10 7.47142 10 7 10.0288" stroke="#aaaaaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="M3 3L21 21M17 10V8C17 5.23858 14.7614 3 12 3C11.0283 3 10.1213 3.27719 9.35386 3.75681M7.08383 7.08338C7.02878 7.38053 7 7.6869 7 8V10.0288M19.5614 19.5618C19.273 20.0348 18.8583 20.4201 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V14.8C4 13.1198 4 12.2798 4.32698 11.638C4.6146 11.0735 5.07354 10.6146 5.63803 10.327C5.99429 10.1455 6.41168 10.0647 7 10.0288M19.9998 14.4023C19.9731 12.9831 19.9731 12.227 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C17.773 10.0269 17.0169 10.0022 15.5977 10.0002M10 10H8.8C8.05259 10 7.47142 10 7 10.0288" stroke="#cccccc" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>
	</g>
</svg>
</template>

<script lang="ts" setup>
import {} from 'vue';

const props = defineProps<{
	type: 'info' | 'question' | 'success' | 'warn' | 'error' | 'waiting' | 'protect';
}>();
</script>

<style lang="scss" module>
.icon {
	stroke-linecap: round;
	stroke-linejoin: round;

	&.info {
		color: var(--MI_THEME-accent);
	}

	&.question {
		color: var(--MI_THEME-fg);
	}

	&.success {
		color: var(--MI_THEME-success);
	}

	&.warn {
		color: var(--MI_THEME-warn);
	}

	&.error {
		color: var(--MI_THEME-error);
	}

	&.waiting {
		color: var(--MI_THEME-accent);
	}

	&.protect {
		color: var(--MI_THEME-accent);
	}
}

.line {
	fill: none;
	stroke: currentColor;
	stroke-width: 8px;
	shape-rendering: geometricPrecision;
}

.animLine {
	stroke-dasharray: 1;
	stroke-dashoffset: 1;
	animation: line var(--duration, 0.5s) cubic-bezier(0,0,.25,1) 1 forwards;
	animation-delay: var(--delay, 0s);
}

.animCircle {
	stroke-dasharray: 1;
	stroke-dashoffset: 1;
	animation: line var(--duration, 0.5s) cubic-bezier(0,0,.25,1) 1 forwards;
	animation-delay: var(--delay, 0s);
	transform-origin: center;
	transform: rotate(-90deg);
}

.animCircleWaiting {
	stroke-dasharray: 1;
	stroke-dashoffset: calc(1 / 1.5);
	animation: waiting 0.75s linear infinite;
	transform-origin: center;
}

.animFade {
	opacity: 0;
	animation: fade-in var(--duration, 0.5s) cubic-bezier(0,0,.25,1) 1 forwards;
	animation-delay: var(--delay, 0s);
}

@keyframes line {
	0% {
		stroke-dashoffset: 1;
		opacity: 0;
	}
	100% {
		stroke-dashoffset: 0;
		opacity: 1;
	}
}

@keyframes waiting {
	0% {
		transform: rotate(0deg);
	}
	100% {
		transform: rotate(360deg);
	}
}

@keyframes fade-in {
	0% {
		opacity: 0;
	}
	100% {
		opacity: 1;
	}
}
</style>
