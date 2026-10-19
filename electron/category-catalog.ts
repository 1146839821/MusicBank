import {musicCategories} from './music-categories.js'
import type {CategoryRecord} from './types.js'
export function defaultCategories():CategoryRecord[]{
  let id=0
  return Object.entries(musicCategories).flatMap(([name,children],sortOrder)=>{
    const root={id:++id,parentId:null,name,sortOrder}
    return [root,...children.map((name,sortOrder)=>({id:++id,parentId:root.id,name,sortOrder}))]
  })
}
export function validateCategories(records:CategoryRecord[]){
  if(!Array.isArray(records))throw new Error('分类列表无效')
  const ids=new Set<number>(),names=new Set<string>()
  for(const record of records){
    if(!record||!Number.isSafeInteger(record.id)||record.id<1||ids.has(record.id)||typeof record.name!=='string'||!record.name.trim()||record.name!==record.name.trim()||record.name.length>60||!Number.isSafeInteger(record.sortOrder)||record.sortOrder<0)throw new Error('分类名称、编号或顺序无效')
    const key=JSON.stringify([record.parentId,record.name]);if(names.has(key))throw new Error('同级分类名称不能重复')
    ids.add(record.id);names.add(key)
  }
  for(const record of records)if(record.parentId!==null&&!records.some(parent=>parent.id===record.parentId&&parent.parentId===null))throw new Error('二级分类必须属于一级分类')
}
export function orderedCategories(records:CategoryRecord[],parentId:number|null){return records.filter(record=>record.parentId===parentId).sort((a,b)=>a.sortOrder-b.sortOrder||a.id-b.id)}
