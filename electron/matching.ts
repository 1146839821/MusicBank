import type {MatchingData, MatchingPair} from './types.js'
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,100}$/.test(value)
/** Validate at every persistence boundary. IDs, never array positions, identify an answer. */
export function validateMatching(data:MatchingData):MatchingData {
  const fail=():never=>{throw new Error('连线题数据无效：请检查项目、图片和一对一标准关系')}
  if(!data||data.version!==1||!['per-pair','all-or-nothing'].includes(data.scoring))fail()
  const ids=new Set<string>()
  for(const items of [data.sources,data.targets]){
    if(!Array.isArray(items)||items.length<2||items.length>12)fail()
    for(const item of items){
      if(!item||!validId(item.id)||ids.has(item.id)||!['text','image'].includes(item.contentType)||typeof item.text!=='string'||item.text.length>2000||!Number.isSafeInteger(item.order)||item.order<0)fail()
      if(item.contentType==='image'?!validId(item.assetId):!item.text.trim())fail()
      ids.add(item.id)
    }
    if(new Set(items.map(item=>item.order)).size!==items.length)fail()
  }
  if(data.sources.length!==data.targets.length)fail()
  const pairs=parseMatchingAnswer(JSON.stringify({version:1,pairs:data.pairs}),data)
  if(pairs.length!==data.sources.length)fail()
  if(data.targetOrder&&(data.targetOrder.length!==data.targets.length||new Set(data.targetOrder).size!==data.targets.length||data.targetOrder.some(id=>!data.targets.some(item=>item.id===id))))fail()
  return data
}
export function parseMatchingAnswer(answer:string|undefined,data:MatchingData):MatchingPair[]{
  if(!answer)return []
  try{
    const value=JSON.parse(answer)
    if(value.version!==1||!Array.isArray(value.pairs)||value.pairs.length>data.sources.length)return []
    const sources=new Set<string>(),targets=new Set<string>()
    for(const pair of value.pairs){
      if(!pair||!data.sources.some(item=>item.id===pair.sourceId)||!data.targets.some(item=>item.id===pair.targetId)||sources.has(pair.sourceId)||targets.has(pair.targetId))return []
      sources.add(pair.sourceId);targets.add(pair.targetId)
    }
    return value.pairs.map((pair:MatchingPair)=>({sourceId:pair.sourceId,targetId:pair.targetId}))
  }catch{return []}
}
export function matchingAnswer(pairs:MatchingPair[]){return JSON.stringify({version:1,pairs})}
export function matchingComplete(answer:string|undefined,data:MatchingData){return parseMatchingAnswer(answer,data).length===data.sources.length}
export function matchingScore(answer:string|undefined,data:MatchingData,total:number){
  validateMatching(data)
  const cents=Math.round(total*100)
  if(!Number.isSafeInteger(cents)||cents<0||Math.abs(total*100-cents)>1e-6)throw new Error('分值最多保留两位小数')
  const pairs=parseMatchingAnswer(answer,data),correct=new Set(pairs.filter(pair=>data.pairs.some(key=>key.sourceId===pair.sourceId&&key.targetId===pair.targetId)).map(pair=>pair.sourceId))
  if(data.scoring==='all-or-nothing')return correct.size===data.sources.length?cents/100:0
  const sources=[...data.sources].sort((a,b)=>a.order-b.order),base=Math.floor(cents/sources.length),remainder=cents%sources.length
  return sources.reduce((sum,item,index)=>sum+(correct.has(item.id)?base+(index<remainder?1:0):0),0)/100
}
export function matchingReference(data:MatchingData){
  const sources=[...data.sources].sort((a,b)=>a.order-b.order),order=data.targetOrder||[...data.targets].sort((a,b)=>a.order-b.order).map(item=>item.id)
  return sources.map((source,index)=>`${index+1} → ${String.fromCharCode(65+order.indexOf(data.pairs.find(pair=>pair.sourceId===source.id)?.targetId||''))}`).join('；')
}
export function shuffleMatching(data:MatchingData,random:()=>number=Math.random):MatchingData {
  const copy=JSON.parse(JSON.stringify(validateMatching(data))) as MatchingData
  const order=copy.targets.map(item=>item.id)
  for(let index=order.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[order[index],order[other]]=[order[other],order[index]]}
  copy.targetOrder=order
  return copy
}

export function validateMatchingAnswer(answer:string|undefined,data:MatchingData){
  if(!answer)return
  let value:unknown
  try{value=JSON.parse(answer)}catch{throw new Error('连线答案格式无效')}
  const raw=value as {version?:unknown;pairs?:unknown}
  if(!raw||raw.version!==1||!Array.isArray(raw.pairs)||parseMatchingAnswer(answer,data).length!==raw.pairs.length)throw new Error('连线答案含有重复或未知项目')
}
