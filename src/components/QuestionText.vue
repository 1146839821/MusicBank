<script setup lang="ts">
import { computed } from 'vue'
import type { TextRun } from '../../electron/types'
const props = defineProps<{ text: string; runs?: TextRun[] }>()
const content = computed(() => props.runs?.map(r=>r.text).join('') === props.text ? props.runs : [{text:props.text}])
</script>
<template><span class="question-text"><span v-for="(run,index) in content" :key="index" :style="{fontWeight:run.bold?700:400,fontStyle:run.italic?'italic':'normal'}">{{ run.text }}</span></span></template>
<style scoped>.question-text{font-synthesis:weight style;white-space:pre-wrap}</style>
