<script setup lang="ts">
import {onUnmounted,ref,watch} from 'vue'
import {mediaUrl} from '../media-store'
const props=defineProps<{assetId:string;alt?:string}>()
const url=ref(''),error=ref(false)
let revision=0
function release(value:string){if(value.startsWith('blob:'))URL.revokeObjectURL(value)}
watch(()=>props.assetId,async id=>{const current=++revision;release(url.value);url.value='';error.value=false;try{const value=await mediaUrl(id);if(current===revision)url.value=value;else release(value)}catch{if(current===revision)error.value=true}},{immediate:true})
onUnmounted(()=>{revision++;release(url.value)})
</script>
<template><span v-if="error" class="asset-error" role="status">图片无法读取，请重新插入</span><img v-else-if="url" :src="url" :alt="alt||'题目图片'" @error="error=true" /><span v-else class="asset-error">读取图片…</span></template>
<style scoped>.asset-error{font-size:12px;color:var(--muted);padding:12px;display:block}</style>
