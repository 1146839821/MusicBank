import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {MusicBankDatabase} from '../electron/db'
import {orderedCategories,validateCategories} from '../electron/category-catalog'
import {createBackup} from '../electron/create-backup'
import {restoreBackup} from '../electron/restore-backup'
import type {QuestionRecord} from '../electron/types'
const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function database(){const root=mkdtempSync(join(tmpdir(),'musicbank-categories-'));roots.push(root);return {root,db:new MusicBankDatabase(root)}}
function question(category:string,subcategory?:string):QuestionRecord{return {id:'q',title:'分类题目',grade:'三年级',category,subcategory,type:'简答题',status:'已发布',hasAudio:false,hasImage:false,updated:'刚刚',difficulty:'基础'}}
describe('editable category catalog',()=>{
  it('initializes 13 primary categories and persists custom names, children and sibling order across restarts',()=>{
    const {root,db}=database()
    expect(orderedCategories(db.listCategories(),null)).toHaveLength(13)
    const mood=db.listCategories().find(record=>record.parentId===null&&record.name==='音乐情绪')!
    db.saveCategory({...mood,name:'情绪与情感'})
    const rootCategory=db.saveCategory({parentId:null,name:'民族音乐'})
    const child=db.saveCategory({parentId:rootCategory.id,name:'藏族'})
    const another=db.saveCategory({parentId:rootCategory.id,name:'蒙古族'})
    const rootIds=orderedCategories(db.listCategories(),null).map(record=>record.id)
    db.reorderCategories(null,[rootCategory.id,...rootIds.filter(id=>id!==rootCategory.id)])
    db.reorderCategories(rootCategory.id,[another.id,child.id]);db.close()
    const reopened=new MusicBankDatabase(root),records=reopened.listCategories()
    expect(orderedCategories(records,null)[0].name).toBe('民族音乐')
    expect(orderedCategories(records,rootCategory.id).map(record=>record.name)).toEqual(['蒙古族','藏族'])
    expect(records.some(record=>record.name==='音乐情绪')).toBe(false)
    expect(records.find(record=>record.id===mood.id)?.name).toBe('情绪与情感')
    reopened.close()
  })
  it('renames linked question categories while preserving existing paper snapshots',()=>{
    const {db}=database(),parent=db.saveCategory({parentId:null,name:'自定义主类'}),child=db.saveCategory({parentId:parent.id,name:'子类'})
    const q=question(parent.name,child.name);db.saveQuestion(q)
    db.savePaper({id:'paper',name:'历史卷',grade:q.grade,totalScore:10,durationMinutes:10,items:[{position:1,questionId:q.id,score:10,snapshot:q}]})
    db.saveCategory({...parent,name:'新主类'});db.saveCategory({...child,name:'新子类'})
    expect(db.listQuestions()[0]).toMatchObject({category:'新主类',subcategory:'新子类'})
    expect(db.listPapers()[0].items[0].snapshot).toMatchObject({category:'自定义主类',subcategory:'子类'})
    db.close()
  })
  it('rejects duplicate names, extra hierarchy and incomplete or duplicate reorder lists without partial changes',()=>{
    const {db}=database(),parent=db.saveCategory({parentId:null,name:'一级'}),child=db.saveCategory({parentId:parent.id,name:'二级'})
    const before=db.listCategories()
    expect(()=>db.saveCategory({parentId:null,name:' 一级 '})).toThrow('重复')
    expect(()=>db.saveCategory({parentId:child.id,name:'三级'})).toThrow('一级分类')
    expect(()=>db.saveCategory({...child,parentId:null})).toThrow('层级')
    expect(()=>db.reorderCategories(null,[parent.id])).toThrow('全部')
    expect(()=>db.reorderCategories(parent.id,[child.id,child.id])).toThrow('全部')
    expect(db.listCategories()).toEqual(before);db.close()
  })
  it('includes the complete catalog in backups and restores stable identifiers and ordering',()=>{
    const source=database(),target=database()
    const root=source.db.saveCategory({parentId:null,name:'备份主类'}),child=source.db.saveCategory({parentId:root.id,name:'备份子类'})
    source.db.saveQuestion(question(root.name,child.name))
    const payload=JSON.parse(JSON.stringify(createBackup(source.db)))
    restoreBackup(target.db,payload)
    expect(target.db.listCategories()).toEqual(source.db.listCategories())
    const corrupt=structuredClone(payload);corrupt.categories.push({...root,id:9999})
    expect(()=>restoreBackup(target.db,corrupt)).toThrow('重复')
    expect(target.db.listCategories()).toEqual(source.db.listCategories())
    source.db.close();target.db.close()
  })
  it('adds imported legacy question classifications to the catalog without requiring category metadata',()=>{
    const {db}=database()
    restoreBackup(db,{format:'musicbank-backup',version:1,exportedAt:new Date().toISOString(),questions:[question('历史自定义','历史二级')],papers:[],wrongQuestionIds:[],assets:[]})
    const parent=db.listCategories().find(record=>record.parentId===null&&record.name==='历史自定义')!
    expect(orderedCategories(db.listCategories(),parent.id).map(record=>record.name)).toEqual(['历史二级'])
    expect(()=>validateCategories([{id:1,parentId:1,name:'循环',sortOrder:0}])).toThrow()
    db.close()
  })
})
