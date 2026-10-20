import {describe,expect,it} from 'vitest'
import {promptLayout} from '../electron/prompt-layout'
import {validateImageGrids} from '../electron/image-grids'
import type {ImageGridBlock} from '../electron/types'
const grid=(id:string,afterParagraph?:number):ImageGridBlock=>({id,kind:'image-grid',columns:2,imageHeight:160,fit:'contain',gap:12,align:'center',items:[{id:id+'-image',assetId:'asset',caption:''}],afterParagraph})
const order=(text:string,grids:ImageGridBlock[])=>promptLayout(text,undefined,grids).map(block=>block.kind==='text'?block.text:block.grid.id)
describe('structured prompt layout',()=>{
  it('keeps unanchored legacy grids at the end and does not split text unnecessarily',()=>{
    expect(order('第一段\n第二段',[grid('legacy')])).toEqual(['第一段\n第二段','legacy'])
    expect(order('第一段\n第二段',[])).toEqual(['第一段\n第二段'])
  })
  it('places grids before text, between any explicit paragraphs and after the last paragraph',()=>{
    expect(order('听辨乐器\n观察下图\n请写出名称',[grid('start',0),grid('middle',2),grid('end')])).toEqual(['start','听辨乐器\n观察下图','middle','请写出名称','end'])
  })
  it('keeps several grids at the same location in teacher-defined order',()=>{
    expect(order('第一段\n第二段',[grid('second',1),grid('first',1)])).toEqual(['第一段','second','first','第二段'])
  })
  it('preserves emphasis across text slices and never interprets text as HTML',()=>{
    const blocks=promptLayout('强拍\n弱拍<script>',[{text:'强拍\n弱',bold:true},{text:'拍<script>',italic:true}],[grid('middle',1)])
    expect(blocks[0]).toMatchObject({kind:'text',text:'强拍',runs:[{text:'强拍',bold:true}]})
    expect(blocks[2]).toMatchObject({kind:'text',text:'弱拍<script>',runs:[{text:'弱',bold:true},{text:'拍<script>',italic:true}]})
    expect(promptLayout('新题干',[{text:'过期格式',bold:true}],[])[0]).toMatchObject({runs:[{text:'新题干'}]})
  })
  it('retains blank paragraphs and handles shortened text without losing grids',()=>{
    expect(order('第一段\n\n第二段\n',[grid('middle',1)])).toEqual(['第一段','middle','\n第二段\n'])
    expect(order('\n结尾',[grid('blank',1)])).toEqual(['','blank','结尾'])
    expect(order('第一段\n',[grid('before-blank',1)])).toEqual(['第一段','before-blank',''])
    expect(order('缩短的题干',[grid('moved-to-end',5)])).toEqual(['缩短的题干','moved-to-end'])
  })
  it('does not mutate question structures while laying them out',()=>{
    const grids=[grid('middle',1)],before=JSON.stringify(grids)
    promptLayout('第一段\n第二段',undefined,grids)
    expect(JSON.stringify(grids)).toBe(before)
  })
  it('omits unfinished empty grids so drafts do not create empty tables or split text',()=>{
    const empty={...grid('empty',1),items:[]}
    expect(order('第一段\n第二段',[empty])).toEqual(['第一段\n第二段'])
  })
  it('rejects malformed insertion positions at save/restore boundaries',()=>{
    for(const value of [-1,1.5,Infinity,NaN,100001])expect(()=>validateImageGrids([grid('invalid',value)])).toThrow('插入位置')
    expect(()=>validateImageGrids([grid('valid',0)])).not.toThrow()
    expect(()=>validateImageGrids([grid('legacy')])).not.toThrow()
  })
})
