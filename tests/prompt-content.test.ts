import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { readPromptContent } from '../src/prompt-content'
import { copyQuestion } from '../src/question-copy'
import type { QuestionRecord } from '../electron/types'
const read = (html: string) => readPromptContent(new DOMParser().parseFromString(`<root>${html}</root>`, 'application/xml').documentElement as unknown as Node)
describe('multi-paragraph question editing', () => {
  it('preserves consecutive empty lines created by Enter for both normal and emphasized text', () => {
    expect(read('第一段<div><br/></div><div>第二段</div>').text).toBe('第一段\n\n第二段')
    const result = read('<b><i>第一段</i></b><div><b><i><br/></i></b></div><div><b><i>第二段</i></b></div>')
    expect(result.text).toBe('第一段\n\n第二段')
    expect(result.runs.filter(run=>run.bold && run.italic).map(run=>run.text)).toEqual(['第一段','第二段'])
  })
  it('retains leading, repeated and trailing blank paragraphs and explicit line breaks', () => {
    expect(read('<div><br/></div><div>旋律</div><div><br/></div><div><br/></div>').text).toBe('\n旋律\n\n')
    expect(read('旋律<br/><br/>节奏').text).toBe('旋律\n\n节奏')
    expect(read('<p>旋律</p><p>节奏</p>').text).toBe('旋律\n节奏')
  })
  it('keeps emphasis ranges and explicit normal-style spans without including markup', () => {
    const result = read('<b>强<span style="font-weight: normal; font-style: italic">弱</span></b>&lt;script&gt;')
    expect(result.text).toBe('强弱<script>')
    expect(result.runs).toEqual([{text:'强',bold:true,italic:false},{text:'弱',bold:false,italic:true},{text:'<script>',bold:false,italic:false}])
  })
})
it('copies emphasis and answer data into an independent draft without changing the original', () => {
  const source: QuestionRecord = {id:'original',title:'听辨乐器',titleRuns:[{text:'听辨',bold:true},{text:'乐器',italic:true}],type:'选择题',grade:'三年级',category:'音乐记号',difficulty:'基础',status:'已发布',hasAudio:false,hasImage:true,imageAssetId:'image',updated:'昨天',options:['钢琴','二胡'],correctAnswer:'A'}
  const copy = copyQuestion(source,'copy')
  expect(copy.titleRuns?.map(run=>run.text).join('')).toBe(copy.title)
  expect(copy.titleRuns?.slice(0,2)).toEqual(source.titleRuns)
  expect(copy.status).toBe('草稿');expect(copy.id).toBe('copy');expect(copy.imageAssetId).toBe('image')
  copy.titleRuns![0].bold = false;copy.options![0] = '笛子'
  expect(source.titleRuns![0].bold).toBe(true);expect(source.options![0]).toBe('钢琴');expect(source.title).toBe('听辨乐器')
})
