<template>
<div class="vrvdvrys">
	<XPie class="pie" :value="cpuUsage" :title="`CPU`"/>
	<XPie class="pie" :value="memUsage" :title="`MEM`"/>
	<XPie class="pie" :value="diskUsage" :title="`DISK`"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const cpuUsage = ref<number>(0);
const memUsage = ref<number>(0);
const diskUsage = ref<number>(0);

function onStats(stats: Misskey.entities.ServerStats) {
	cpuUsage.value = stats.cpu;
	memUsage.value = stats.mem.active / props.meta.mem.total;
	diskUsage.value = props.meta.fs.used / props.meta.fs.total;
}

onMounted(() => {
	props.connection.on('stats', onStats);
});

onBeforeUnmount(() => {
	props.connection.off('stats', onStats);
});
</script>

	<style lang="scss" scoped>
	.vrvdvrys {
		display: flex;
		padding: 16px;

		> .pie {
			height: 82px;
			flex-shrink: 0;
			margin-right: 12px;
		}
	}
	</style>
