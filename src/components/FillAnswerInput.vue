<script setup lang="ts">
const props = defineProps<{modelValue: string; count: number; readonly?: boolean; disabled?: boolean}>()
const emit = defineEmits<{'update:modelValue': [value: string]}>()
function update(index: number, event: Event) {
  const values = Array.from({length: Math.max(1, props.count)}, (_, i) => props.modelValue.split('\n')[i] || '')
  values[index] = (event.target as HTMLInputElement).value
  emit('update:modelValue', values.join('\n'))
}
</script>
<template>
  <div class="fill-answer-inputs" role="group" aria-label="填空题作答">
    <label v-for="index in Math.max(1, count)" :key="index">
      <span>第 {{index}} 空</span>
      <input :value="modelValue.split('\n')[index-1] || ''" :readonly="readonly" :disabled="disabled" :aria-label="`第${index}空`" placeholder="请输入答案" autocomplete="off" @input="update(index-1, $event)" />
    </label>
    <small v-if="count > 1">请按题干顺序填写，全部空答对后本题得分。</small>
  </div>
</template>
<style scoped>
.fill-answer-inputs{display:grid;gap:14px;margin:24px 0}.fill-answer-inputs label{display:grid;grid-template-columns:66px minmax(0,1fr);align-items:center;gap:12px}.fill-answer-inputs label>span{font-size:14px;color:var(--text-secondary,#747b86)}.fill-answer-inputs input{width:100%;min-width:0;box-sizing:border-box;padding:13px 16px;border:1px solid var(--border,#e3e6ed);border-radius:10px;background:var(--bg-secondary,#f7f8fb);color:inherit;font:inherit}.fill-answer-inputs input:focus-visible{outline:2px solid #5176e9;outline-offset:2px}.fill-answer-inputs small{color:var(--text-secondary,#747b86);font-size:12px;line-height:1.6}
</style>
