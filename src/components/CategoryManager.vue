<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {CategoryRecord,QuestionRecord} from '../../electron/types'
import {orderedCategories} from '../../electron/category-catalog'
import {listCategories,saveCategory,reorderCategories} from '../category-store'
const props=defineProps<{records:CategoryRecord[];questions:QuestionRecord[]}>()
const emit=defineEmits<{change:[records:CategoryRecord[]]}>()
const selectedId=ref<number|null>(null),newRoot=ref(''),newChild=ref(''),editingId=ref<number|null>(null),editName=ref(''),busy=ref(false),error=ref(''),status=ref('')
const roots=computed(()=>orderedCategories(props.records,null)),selected=computed(()=>roots.value.find(record=>record.id===selectedId.value)),children=computed(()=>selected.value?orderedCategories(props.records,selected.value.id):[])
watch(roots,()=>{if(!selected.value)selectedId.value=roots.value[0]?.id??null},{immediate:true})
function select(id:number){selectedId.value=id;editingId.value=null;newChild.value='';status.value='';error.value=''}
function count(record:CategoryRecord){const parent=props.records.find(item=>item.id===record.parentId);return props.questions.filter(question=>record.parentId===null?question.category===record.name:question.category===parent?.name&&question.subcategory===record.name).length}
function edit(record:CategoryRecord){editingId.value=record.id;editName.value=record.name;error.value='';status.value=''}
async function persist(parentId:number|null,id?:number){
  if(busy.value)return
  busy.value=true;error.value='';status.value=''
  try{const record=await saveCategory({id,parentId,name:id===undefined?(parentId===null?newRoot.value:newChild.value):editName.value});emit('change',await listCategories());if(parentId===null)selectedId.value=record.id;newRoot.value='';newChild.value='';editingId.value=null;status.value=id===undefined?'分类已新增':'分类已更新，题库中的关联分类已同步'}catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
async function move(record:CategoryRecord,offset:number){
  if(busy.value)return
  const siblings=orderedCategories(props.records,record.parentId),index=siblings.findIndex(item=>item.id===record.id),target=index+offset
  if(target<0||target>=siblings.length)return
  const ids=siblings.map(item=>item.id);[ids[index],ids[target]]=[ids[target],ids[index]]
  busy.value=true;error.value='';status.value=''
  try{await reorderCategories(record.parentId,ids);emit('change',await listCategories());status.value='分类顺序已保存'}catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
</script>
<template>
<section class="view category-view">
  <div class="view-heading"><div><div class="eyebrow">题库管理 / 分类目录</div><h1>分类管理</h1><p>维护一级与二级分类，录题、筛选和组卷会同步使用此目录。</p></div><span class="paper-status">{{roots.length}} 个一级分类</span></div>
  <p v-if="error" class="form-error" role="alert">{{error}}</p><p v-if="status" class="category-status" role="status">{{status}}</p>
  <form class="category-add panel" @submit.prevent="persist(null)"><label class="field"><span>新增一级分类</span><input v-model="newRoot" maxlength="60" :disabled="busy" placeholder="例如：民族音乐" /></label><button class="primary-button" :disabled="busy||!newRoot.trim()">新增分类</button></form>
  <div class="category-layout">
    <div class="panel category-roots" role="list" aria-label="一级分类列表"><div v-for="(record,index) in roots" :key="record.id" class="category-row" :class="{selected:record.id===selectedId}" role="listitem"><button class="category-select" :disabled="busy" :aria-pressed="record.id===selectedId" @click="select(record.id)"><span>{{record.name}}</span><small>{{count(record)}} 道题 · {{records.filter(child=>child.parentId===record.id).length}} 个子分类</small></button><div class="category-order"><button type="button" :disabled="busy||index===0" :aria-label="`上移${record.name}`" @click="move(record,-1)">↑</button><button type="button" :disabled="busy||index===roots.length-1" :aria-label="`下移${record.name}`" @click="move(record,1)">↓</button></div></div></div>
    <div v-if="selected" class="panel category-details">
      <div class="category-detail-heading"><div><span class="eyebrow">一级分类</span><h2>{{selected.name}}</h2><p>{{count(selected)}} 道题 · {{children.length}} 个二级分类</p></div><button class="secondary-button" :disabled="busy" @click="edit(selected)">编辑名称</button></div>
      <form v-if="editingId!==null" class="category-edit" @submit.prevent="persist(records.find(record=>record.id===editingId)!.parentId,editingId!)"><label class="field"><span>分类名称</span><input v-model="editName" maxlength="60" :disabled="busy" /></label><div><button type="button" class="ghost-button" :disabled="busy" @click="editingId=null">取消</button><button class="primary-button" :disabled="busy||!editName.trim()">保存名称</button></div></form>
      <p class="category-note">重命名会更新题库中的关联分类。已保存试卷与历史答卷保留生成时的内容。</p>
      <h3>二级分类</h3>
      <div v-for="(record,index) in children" :key="record.id" class="category-child"><div><strong>{{record.name}}</strong><small>{{count(record)}} 道题</small></div><div class="category-order"><button type="button" :disabled="busy||index===0" :aria-label="`上移${record.name}`" @click="move(record,-1)">↑</button><button type="button" :disabled="busy||index===children.length-1" :aria-label="`下移${record.name}`" @click="move(record,1)">↓</button><button type="button" :disabled="busy" :aria-label="`编辑${record.name}`" @click="edit(record)">编辑</button></div></div>
      <p v-if="!children.length" class="category-note">还没有二级分类，可以添加更细的知识点目录。</p>
      <form class="category-add-child" @submit.prevent="persist(selected!.id)"><label class="field"><span>新增二级分类</span><input v-model="newChild" maxlength="60" :disabled="busy" placeholder="请输入二级分类名称" /></label><button class="secondary-button" :disabled="busy||!newChild.trim()">添加</button></form>
    </div>
  </div>
</section>
</template>
<style scoped>
.category-add{padding:20px;display:flex;align-items:end;gap:16px;margin-bottom:20px}.category-add .field{flex:1}.category-layout{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(360px,1.6fr);gap:20px;align-items:start}.category-roots{padding:8px;max-height:min(620px,calc(100vh - 300px));min-height:220px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.category-row{display:flex;align-items:center;border-radius:10px;padding:6px 10px;margin:3px 0;gap:8px}.category-row.selected{background:var(--accent-soft,#edf2ff)}.category-select{flex:1;text-align:left;border:0;background:none;display:grid;gap:5px;padding:10px 4px;color:var(--text);font-size:14px;min-width:0}.category-select span{overflow-wrap:anywhere}.category-select small,.category-child small,.category-detail-heading p,.category-note{color:var(--muted);font-size:12px;line-height:1.7}.category-order{display:flex;gap:6px;flex-shrink:0}.category-order button{border:1px solid var(--line);background:var(--surface);border-radius:7px;min-width:30px;min-height:30px;padding:4px 8px;color:var(--text)}.category-details{padding:24px}.category-detail-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.category-detail-heading h2{margin:10px 0}.category-details h3{font-size:14px;margin-top:26px}.category-child{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding:14px 0}.category-child>div:first-child{display:grid;gap:4px}.category-child strong{font-size:13px}.category-add-child{display:flex;align-items:end;gap:12px;margin-top:24px}.category-add-child .field{flex:1}.category-edit{display:grid;gap:12px;background:var(--surface-subtle,#f7f8fb);padding:16px;border-radius:10px;margin:20px 0}.category-edit>div{display:flex;justify-content:end;gap:8px}.category-status{font-size:13px;color:var(--accent,#3b6df6);margin-bottom:16px}@media(max-width:1000px){.category-layout{grid-template-columns:1fr}.category-add{flex-wrap:wrap}.category-add .field{min-width:200px}}
</style>
