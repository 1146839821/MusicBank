import {afterEach,describe,expect,it,vi} from 'vitest'
import {listCategories,saveCategory,reorderCategories} from '../src/category-store'
import {orderedCategories} from '../electron/category-catalog'
afterEach(()=>vi.unstubAllGlobals())
function storage(){
  const values=new Map<string,string>()
  const setItem=vi.fn((key:string,value:string)=>{values.set(key,value)})
  vi.stubGlobal('window',{})
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem})
  return {values,setItem}
}
describe('browser category persistence',()=>{
  it('keeps new categories, children and order after reloading the catalog',async()=>{
    storage()
    const root=await saveCategory({parentId:null,name:'民族音乐'})
    await saveCategory({parentId:root.id,name:'藏族民歌'})
    const roots=orderedCategories(await listCategories(),null)
    await reorderCategories(null,[root.id,...roots.filter(item=>item.id!==root.id).map(item=>item.id)])
    const catalog=await listCategories()
    expect(orderedCategories(catalog,null)[0]).toEqual({...root,sortOrder:0})
    expect(orderedCategories(catalog,root.id).map(item=>item.name)).toEqual(['藏族民歌'])
  })
  it('renames question links while leaving saved paper snapshots intact',async()=>{
    const {values}=storage()
    const root=(await listCategories()).find(item=>item.parentId===null)!
    const question={id:'q',category:root.name}
    values.set('musicbank.questions',JSON.stringify([question]))
    const snapshot=JSON.stringify([{items:[{snapshot:question}]}]);values.set('musicbank.papers',snapshot)
    await saveCategory({...root,name:'改名'})
    expect(JSON.parse(values.get('musicbank.questions')!)[0].category).toBe('改名')
    expect(values.get('musicbank.papers')).toBe(snapshot)
  })
  it('restores question links if saving the renamed catalog fails',async()=>{
    const {values,setItem}=storage(),root=(await listCategories()).find(item=>item.parentId===null)!
    const original=JSON.stringify([{id:'q',category:root.name}]);values.set('musicbank.questions',original)
    setItem.mockImplementation((key,value)=>{if(key==='musicbank.categories')throw new Error('空间不足');values.set(key,value)})
    await expect(saveCategory({...root,name:'未保存名称'})).rejects.toThrow('空间不足')
    expect(values.get('musicbank.questions')).toBe(original)
    expect((await listCategories()).find(item=>item.id===root.id)?.name).toBe(root.name)
  })
})
