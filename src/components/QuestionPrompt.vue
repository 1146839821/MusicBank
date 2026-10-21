<script setup lang="ts">
import {computed} from 'vue'
import type {ImageGridBlock,TextRun} from '../../electron/types'
import {promptLayout} from '../../electron/prompt-layout'
import ImageGrids from './ImageGrids.vue'
import QuestionText from './QuestionText.vue'
const props=defineProps<{text:string;runs?:TextRun[];grids?:ImageGridBlock[]}>()
const blocks=computed(()=>promptLayout(props.text,props.runs,props.grids))
</script>
<template>
  <div class="question-prompt">
    <template v-for="block in blocks" :key="block.key">
      <slot v-if="block.kind==='text'" :text="block.text" :runs="block.runs"><p class="prompt-paragraph"><QuestionText :text="block.text" :runs="block.runs" /></p></slot>
      <ImageGrids v-else :model-value="[block.grid]" />
    </template>
  </div>
</template>
<style scoped>
.question-prompt{min-width:0;overflow-wrap:anywhere}.prompt-paragraph{white-space:pre-wrap;min-height:1em}.question-prompt :slotted(h2),.question-prompt :slotted(h3){min-height:1em}
</style>
