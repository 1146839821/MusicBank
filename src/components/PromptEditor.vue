<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { readPromptContent } from '../prompt-content'
import type { TextRun } from '../../electron/types'
const props = defineProps<{ text: string; runs?: TextRun[] }>()
const emit = defineEmits<{ change: [text: string, runs: TextRun[]] }>()
const editor = ref<HTMLDivElement>()
const bold = ref(false), italic = ref(false)
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
let lastText = '', lastRuns = ''
function sync() {
  if (!editor.value || (props.text === lastText && JSON.stringify(props.runs || []) === lastRuns)) return
  const runs = props.runs?.map(r => r.text).join('') === props.text ? props.runs : [{text: props.text}]
  editor.value.innerHTML = runs!.map(r => `${r.bold?'<b>':''}${r.italic?'<i>':''}${escape(r.text).replace(/\n/g,'<br>')}${r.italic?'</i>':''}${r.bold?'</b>':''}`).join('')
  lastText = props.text; lastRuns = JSON.stringify(props.runs || [])
}
function read() {
  if (!editor.value) return
  const {text, runs} = readPromptContent(editor.value)
  lastText = text; lastRuns = JSON.stringify(runs)
  emit('change', lastText, runs); state()
}
function state() { bold.value = document.queryCommandState('bold'); italic.value = document.queryCommandState('italic') }
function command(name: string) { editor.value?.focus(); document.execCommand(name); read() }
function paste(event: ClipboardEvent) { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || ''); read() }
watch(() => [props.text, props.runs], sync, {deep:true, flush:'post'})
onMounted(sync)
</script>
<template>
  <div class="editor-toolbar">
    <button type="button" aria-label="加粗" title="加粗（⌘/Ctrl+B）" :aria-pressed="bold" @mousedown.prevent @click="command('bold')"><b>B</b></button>
    <button type="button" aria-label="倾斜" title="倾斜（⌘/Ctrl+I）" :aria-pressed="italic" @mousedown.prevent @click="command('italic')"><i>I</i></button>
    <span></span><slot /><span></span>
    <button type="button" aria-label="撤销" title="撤销" @mousedown.prevent @click="command('undo')">↶</button>
    <button type="button" aria-label="重做" title="重做" @mousedown.prevent @click="command('redo')">↷</button>
  </div>
  <div ref="editor" class="rich-editor prompt-editor" contenteditable="true" role="textbox" aria-label="题干内容" aria-multiline="true" data-placeholder="请输入题目内容..." @input="read" @keyup="state" @mouseup="state" @paste="paste" @drop.prevent></div>
</template>
<style scoped>
.prompt-editor{font-synthesis:weight style;white-space:pre-wrap;overflow-wrap:anywhere;outline:none;cursor:text;font-weight:400}
.prompt-editor:empty::before{content:attr(data-placeholder);color:#9aa3b1;pointer-events:none}
.prompt-editor:focus-visible{box-shadow:inset 0 0 0 2px #537cf34d}
.editor-toolbar button[aria-pressed=true]{background:#e8eefe;color:#3764d5}
.prompt-editor :deep(b),.prompt-editor :deep(strong){font-weight:700}
.prompt-editor :deep(i),.prompt-editor :deep(em){font-style:italic}
</style>
