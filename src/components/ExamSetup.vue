<script setup lang="ts">
import {ref} from 'vue'
defineProps<{name:string;count:number;duration:number;busy:boolean}>()
const emit=defineEmits<{start:[name:string]}>()
const nameInput=ref('')
</script>
<template>
<form class="exam-setup panel" @submit.prevent="emit('start',nameInput)">
  <div class="eyebrow">准备考试</div><h2>{{name}}</h2>
  <p>{{count}} 道题 · {{duration}} 分钟。点击开始后计时，答题进度会自动保存。</p>
  <label class="field"><span>考生姓名 <small>选填</small></span><input v-model="nameInput" maxlength="60" :disabled="busy" placeholder="填写姓名，方便在考试记录中查找" autocomplete="off" /></label>
  <p class="exam-setup-note">也可以留空开始。姓名仅保存在本机的考试记录与备份中。</p>
  <button type="submit" class="primary-button" :disabled="busy">{{busy?'正在开始…':'开始考试'}}</button>
</form>
</template>
<style scoped>
.exam-setup{max-width:660px;margin:48px auto;padding:36px}.exam-setup h2{margin:12px 0;font-size:24px;letter-spacing:-.02em}.exam-setup p{color:var(--text-secondary,#747b86);font-size:14px;line-height:1.8}.exam-setup .field{margin-top:28px}.exam-setup-note{margin:12px 0 28px;font-size:12px!important}.exam-setup .primary-button{width:100%}@media(max-width:720px){.exam-setup{margin:24px 0;padding:24px}}
</style>
