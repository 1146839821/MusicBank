<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { QuestionAttachment } from '../../electron/types'
import { mediaUrl } from '../media-store'
const props=defineProps<{attachments:QuestionAttachment[];editable?:boolean;missingAudio?:boolean;missingImage?:boolean}>()
const emit=defineEmits<{remove:[id:string];duration:[id:string,value:string]}>()
const items=ref<Array<QuestionAttachment & {url?:string;error?:string}>>([])
const container=ref<HTMLElement>()
let revision=0
function stop(){container.value?.querySelectorAll('audio').forEach(audio=>audio.pause())}
function release(){stop();for(const item of items.value)if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url)}
watch(()=>props.attachments,async attachments=>{
  const current=++revision;release();items.value=attachments.map(item=>({...item}))
  await Promise.all(attachments.map(async item=>{
    try {const url=await mediaUrl(item.id);if(current!==revision){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return}const target=items.value.find(i=>i.id===item.id);if(target)target.url=url}
    catch(e){if(current===revision){const target=items.value.find(i=>i.id===item.id);if(target)target.error=(e as Error).message}}
  }))
},{immediate:true,deep:false})
onUnmounted(()=>{revision++;release()})
function loaded(item:QuestionAttachment,event:Event){const audio=event.target as HTMLAudioElement;if(!Number.isFinite(audio.duration))return;const duration=`${Math.floor(audio.duration/60).toString().padStart(2,'0')}:${Math.floor(audio.duration%60).toString().padStart(2,'0')}`;emit('duration',item.id,duration)}
function play(event:Event){container.value?.querySelectorAll('audio').forEach(audio=>{if(audio!==event.target)audio.pause()})}
</script>
<template><div ref="container" class="question-media">
  <div v-for="(item,index) in items" :key="item.id" class="media-item" :class="item.assetType">
    <div class="media-heading"><span>{{ item.assetType==='image'?'图片':'音频' }} {{ items.slice(0,index+1).filter(media=>media.assetType===item.assetType).length }} · {{ item.name }}</span><button v-if="editable" type="button" class="text-button" :aria-label="`移除 ${item.name}`" @click="emit('remove',item.id)">移除</button></div>
    <p v-if="item.error" class="media-error" role="status">{{ item.error }}</p>
    <img v-else-if="item.url && item.assetType==='image'" :src="item.url" :alt="item.name" @error="item.error='图片无法读取，请重新插入'" />
    <audio v-else-if="item.url" :src="item.url" controls preload="metadata" :aria-label="item.name" @loadedmetadata="loaded(item,$event)" @play="play" @error="item.error='音频无法播放，请重新插入有效的 MP3 或 WAV 文件'"></audio>
    <span v-else class="media-loading">正在读取素材…</span>
  </div>
  <p v-if="missingImage" class="media-error">原题图片未保存，请重新插入图片。</p><p v-if="missingAudio" class="media-error">原题音频未保存，请重新插入音频。</p>
</div></template>
<style scoped>
.question-media{display:grid;gap:14px;min-width:0}.media-item{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);min-width:0}.media-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px;font-size:11px;color:var(--muted)}.media-heading>span{overflow-wrap:anywhere}.media-heading button{flex-shrink:0}.media-item img{display:block;max-width:100%;max-height:480px;object-fit:contain;margin:auto}.media-item audio{display:block;width:100%;min-width:0;height:40px}.media-error{font-size:12px;color:#be624d;line-height:1.6;margin:8px 0}.media-loading{font-size:11px;color:var(--muted)}
</style>
