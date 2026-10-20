import type {ImageGridBlock,TextRun} from './types.js'

export type PromptBlock =
  | {kind:'text';key:string;text:string;runs:TextRun[]}
  | {kind:'image-grid';key:string;grid:ImageGridBlock}

/** A paragraph is an explicit newline, not a visual line created by wrapping. */
export function promptParagraphs(text:string){return text.split('\n')}

/** Shared by the screen and Word export. Old grids without anchors stay at the end. */
export function promptLayout(text:string,runs:TextRun[]|undefined,grids:ImageGridBlock[]=[]):PromptBlock[]{
  const paragraphs=promptParagraphs(text),count=paragraphs.length
  const content=runs?.map(run=>run.text).join('')===text?runs:[{text}]
  const groups=new Map<number,ImageGridBlock[]>()
  for(const grid of grids){
    const position=grid.afterParagraph===undefined?count:Math.min(count,Math.max(0,grid.afterParagraph))
    groups.set(position,[...groups.get(position)||[],grid])
  }
  const blocks:PromptBlock[]=[]
  let start=0,lastPosition=0
  function appendText(end:number){
    let offset=0
    const sliced:TextRun[]=[]
    for(const run of content!){
      const from=Math.max(start,offset),to=Math.min(end,offset+run.text.length)
      if(to>from)sliced.push({...run,text:run.text.slice(from-offset,to-offset)})
      offset+=run.text.length
    }
    blocks.push({kind:'text',key:`text-${start}`,text:text.slice(start,end),runs:sliced})
  }
  for(const [position,items] of [...groups].sort(([a],[b])=>a-b)){
    if(position>lastPosition){
      const end=position===count?text.length:paragraphs.slice(0,position).reduce((sum,p)=>sum+p.length+1,0)-1
      appendText(end)
      start=position===count?text.length:end+1
    }
    for(const grid of items)blocks.push({kind:'image-grid',key:`grid-${grid.id}`,grid})
    lastPosition=position
  }
  if(lastPosition<count)appendText(text.length)
  return blocks
}
