import type {CategoryRecord,QuestionRecord} from '../electron/types'
import {defaultCategories,validateCategories,orderedCategories} from '../electron/category-catalog'
const key='musicbank.categories'
function localCatalog():CategoryRecord[]{const raw=localStorage.getItem(key);const records=raw?JSON.parse(raw):defaultCategories();validateCategories(records);return records}
export async function listCategories(){return window.musicBank?window.musicBank.categories.list():localCatalog()}
export async function saveCategory(input:{id?:number;parentId:number|null;name:string}){
  if(window.musicBank)return window.musicBank.categories.save(input)
  const records=localCatalog(),previous=records.find(record=>record.id===input.id)
  if(input.id!==undefined&&!previous)throw new Error('分类不存在')
  if(previous&&previous.parentId!==input.parentId)throw new Error('不能改变分类所属层级')
  const record:CategoryRecord={id:previous?.id??Math.max(0,...records.map(record=>record.id))+1,parentId:input.parentId,name:input.name.trim(),sortOrder:previous?.sortOrder??Math.max(-1,...records.filter(record=>record.parentId===input.parentId).map(record=>record.sortOrder))+1}
  const next=[...records.filter(item=>item.id!==record.id),record];validateCategories(next)
  let renamedQuestions:string|undefined
  const oldQuestions=localStorage.getItem('musicbank.questions')
  if(previous){
    const raw=oldQuestions
    if(raw){const questions=JSON.parse(raw) as QuestionRecord[],parent=records.find(record=>record.id===previous.parentId)
      for(const question of questions){if(previous.parentId===null&&question.category===previous.name)question.category=record.name;else if(parent&&question.category===parent.name&&question.subcategory===previous.name)question.subcategory=record.name}
      renamedQuestions=JSON.stringify(questions)
    }
  }
  if(renamedQuestions!==undefined)localStorage.setItem('musicbank.questions',renamedQuestions)
  try{localStorage.setItem(key,JSON.stringify(next))}catch(error){
    if(renamedQuestions!==undefined&&oldQuestions!==null)localStorage.setItem('musicbank.questions',oldQuestions)
    throw error
  }
  return record
}
export async function reorderCategories(parentId:number|null,ids:number[]){
  if(window.musicBank)return window.musicBank.categories.reorder({parentId,ids})
  const records=localCatalog(),siblings=orderedCategories(records,parentId)
  if(ids.length!==siblings.length||new Set(ids).size!==ids.length||ids.some(id=>!siblings.some(record=>record.id===id)))throw new Error('排序必须包含全部同级分类')
  for(const record of records)if(record.parentId===parentId)record.sortOrder=ids.indexOf(record.id)
  localStorage.setItem(key,JSON.stringify(records))
}
