<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { renderAsync } from 'docx-preview'
import { buildPaperDocument } from '../../electron/paper-documents'
import type { DocumentKind, PaperRecord, TemplateSummary } from '../../electron/types'
import { paginatePreview } from '../papers/paginate'
import { resolveMediaImage } from '../media-store'
import { templateBytes } from '../papers/template-store'
const props=defineProps<{paper:PaperRecord;summary:TemplateSummary}>()
const emit=defineEmits<{close:[]}>()
const desktop=Boolean(window.musicBank)
const kind=ref<DocumentKind>('paper'),busy=ref(false),loading=ref(false),error=ref(''),renderFailed=ref(false),status=ref(''),host=ref<HTMLDivElement|null>(null)
const documents=new Map<DocumentKind,Uint8Array>()
let revision=0
const asBuffer=(bytes:Uint8Array)=>bytes.slice().buffer as ArrayBuffer
async function preview(){
  const current=++revision;loading.value=true;error.value='';renderFailed.value=false;status.value=''
  try{
    let bytes=documents.get(kind.value)
    if(!bytes){bytes=window.musicBank?new Uint8Array(await window.musicBank.documents.build(props.paper.id,kind.value)):await buildPaperDocument(await templateBytes(props.paper.templateId!),props.paper,kind.value,resolveMediaImage);documents.set(kind.value,bytes)}
    await nextTick();if(current!==revision||!host.value)return
    const container=document.createElement('div')
    await renderAsync(asBuffer(bytes),container,container,{inWrapper:true,ignoreWidth:false,ignoreHeight:false,breakPages:true,ignoreLastRenderedPageBreak:false,useBase64URL:true,renderHeaders:true,renderFooters:true,renderFootnotes:true})
    if(current!==revision||!host.value)return
    host.value.replaceChildren(container)
    await document.fonts.ready
    await Promise.all(Array.from(host.value.querySelectorAll('img')).map(image=>image.decode().catch(()=>{})))
    if(current===revision&&host.value)paginatePreview(host.value)
  }catch(e){if(current===revision){error.value=(e as Error).message;renderFailed.value=true}}
  finally{if(current===revision)loading.value=false}
}
function download(bytes:Uint8Array,name:string){const url=URL.createObjectURL(new Blob([asBuffer(bytes)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function word(){if(busy.value||loading.value)return;busy.value=true;error.value='';try{if(window.musicBank){const result=await window.musicBank.documents.saveWord(props.paper.id,kind.value);if(!result.canceled)status.value='Word 文档已保存'}else{download(documents.get(kind.value)!,`${props.paper.name}-${kind.value==='paper'?'试卷':'答案'}.docx`);status.value='Word 文档已下载'}}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function output(format:'pdf'|'print'){
  if(busy.value||loading.value||!host.value)return
  busy.value=true;error.value=''
  try{
    if(!window.musicBank){window.print();return}
    const result=await window.musicBank.documents.output({name:`${props.paper.name}-${kind.value==='paper'?'试卷':'答案'}`,html:host.value.innerHTML,format,pageWidth:props.summary.pageWidth,pageHeight:props.summary.pageHeight})
    if(!result.canceled)status.value=format==='pdf'?'PDF 已保存':'已发送至打印机'
  }catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
watch(kind,preview)
onMounted(()=>{document.body.classList.add('exam-document-open');preview()})
onUnmounted(()=>{revision++;document.body.classList.remove('exam-document-open')})
</script>
<template>
  <Teleport to="body"><div class="exam-doc-backdrop"><section class="exam-doc-modal" role="dialog" aria-modal="true" aria-labelledby="exam-doc-title">
    <header class="exam-doc-header"><div><span class="eyebrow">考试文档</span><h2 id="exam-doc-title">{{ paper.name }}</h2></div><button class="icon-button" aria-label="关闭考试文档" :disabled="busy" @click="emit('close')">×</button></header>
    <div class="exam-doc-toolbar"><div class="document-segment"><button :aria-pressed="kind==='paper'" :disabled="busy" @click="kind='paper'">学生试卷</button><button :aria-pressed="kind==='answers'" :disabled="busy" @click="kind='answers'">参考答案</button></div><span>分别保存试卷与答案</span><button class="secondary-button" :disabled="busy||loading||renderFailed" @click="word">下载 Word</button><button class="secondary-button" :disabled="busy||loading||renderFailed" @click="output('pdf')">{{ desktop ? '下载 PDF' : '打印 / 另存 PDF' }}</button><button v-if="desktop" class="primary-button" :disabled="busy||loading||renderFailed" @click="output('print')">打印</button></div>
    <div v-if="error" role="alert" class="form-error">{{ error }}</div><div v-if="loading" class="document-loading">正在排版文档…</div>
    <div ref="host" class="exam-doc-pages" :class="{pending:loading}"></div>
    <footer class="exam-doc-footer"><span role="status">{{ busy?'正在处理…':status||'打印预览采用本机字体；复杂文本框请同时核对 Word 原稿。' }}</span><span>{{ summary.pageWidth.toFixed(0) }} × {{ summary.pageHeight.toFixed(0) }} mm</span></footer>
  </section></div></Teleport>
</template>
<style>
.exam-doc-backdrop{position:fixed;inset:0;z-index:100;background:#18253c66;backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px}.exam-doc-modal{display:flex;flex-direction:column;width:min(1300px,100%);height:calc(100dvh - 40px);background:#f3f4f7;border:1px solid #dddfe6;border-radius:16px;overflow:hidden;box-shadow:0 24px 90px #18253c3d;color:#202124}.exam-doc-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:white;flex-shrink:0}.exam-doc-header h2{margin:4px 0 0;font-size:18px}.exam-doc-toolbar{display:flex;gap:10px;align-items:center;padding:12px 24px;background:white;border-bottom:1px solid #e5e8ed;flex-wrap:wrap;flex-shrink:0}.exam-doc-toolbar>span{flex:1;font-size:12px;color:#8c929d}.document-segment{display:flex;padding:3px;background:#eff1f5;border-radius:9px}.document-segment button{padding:8px 14px;border-radius:7px;font-size:12px}.document-segment [aria-pressed=true]{background:white;color:#3260e6;box-shadow:0 1px 4px #17243b14}.exam-doc-pages{overflow:auto;flex:1;min-height:0}.exam-doc-pages.pending{visibility:hidden}.exam-doc-pages .docx-wrapper{background:#eaecf1;padding:24px;min-width:max-content}.exam-doc-pages .docx-wrapper>section.docx{margin-bottom:24px;box-shadow:0 3px 14px #18253c15}.exam-doc-footer{display:flex;justify-content:space-between;padding:12px 24px;background:white;font-size:11px;color:#8c929d;flex-shrink:0}.document-loading{padding:30px;text-align:center}.exam-doc-pages .docx-wrapper section.docx{color:#000;background:white}.exam-doc-toolbar button:active{transform:scale(.98)}
@media print{body.exam-document-open{min-width:0!important;background:white!important}body.exam-document-open #app{display:none!important}.exam-doc-backdrop{display:block;position:static;padding:0;background:white;backdrop-filter:none}.exam-doc-modal{display:block;position:static;height:auto;width:auto;border:0;box-shadow:none;overflow:visible}.exam-doc-header,.exam-doc-toolbar,.exam-doc-footer{display:none!important}.exam-doc-pages{overflow:visible}.exam-doc-pages .docx-wrapper{padding:0!important;background:white;min-width:0}.exam-doc-pages .docx-wrapper>section.docx{margin:0!important;box-shadow:none;break-after:page}.exam-doc-pages .docx-wrapper>section.docx:last-child{break-after:auto}@page{margin:0}}
</style>
