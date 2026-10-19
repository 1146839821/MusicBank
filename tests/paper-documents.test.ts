import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { inspectTemplate, buildPaperDocument, answerText } from '../electron/paper-documents'
import { generatePaperPlan, type PaperPlan } from '../electron/paper-plan'
import { judgmentCorrect } from '../src/question-answers'
import type { PaperRecord, QuestionRecord } from '../electron/types'
const p=(text:string)=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
async function template(body=p('XX学校XXXX年XX学期')+p('期末检测试卷')+p('一、填空题（每题X分，共计X分）')+p('旧题不应保留')+p('二、选择题')+p('三、判断题')+p('四、简答题')+p('参考答案')+p('旧答案不应保留')){
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`);return zip.generateAsync({type:'uint8array'})
}
const question=(type:QuestionRecord['type'],id=type):QuestionRecord=>({id,title:`${type}测试题`,type,grade:'六年级',category:'音乐记号',status:'已发布',hasImage:false,hasAudio:false,updated:'刚刚',difficulty:'基础',options:['选项甲','选项乙'],correctAnswer:type==='判断题'?'false':'B',fillAnswers:['强'],referenceAnswer:'参考简答内容',explanation:'答案解析内容'})
function paper():PaperRecord{return {id:'paper',name:'音乐期末考试',grade:'六年级',totalScore:8,durationMinutes:40,examInfo:{school:'实验小学',schoolYear:'2026学年',term:'第一学期',subject:'音乐',examDate:'2026-12-01',instructions:'认真作答'},items:([ '填空题','选择题','判断题','简答题'] as const).map((type,index)=>({position:index+1,questionId:type,score:2,snapshot:question(type)}))}}
async function xml(bytes:Uint8Array){return (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')}
describe('real Word exam templates',()=>{
  it('provides a choice answer blank and 19pt body leading while preserving bold and italic text',async()=>{
    const exam=paper(),q=exam.items[1].snapshot
    q.titleRuns=[{text:'选择题',bold:true},{text:'测试题',italic:true}]
    const student=await xml(await buildPaperDocument(await template(),exam,'paper'))
    expect(student).toContain('（　　）（2 分）')
    expect(student).toContain('w:line="380" w:lineRule="exact"')
    expect(student).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">选择题<\/w:t>/)
    expect(student).toMatch(/<w:i\/><\/w:rPr><w:t xml:space="preserve">测试题<\/w:t>/)
    const answers=await xml(await buildPaperDocument(await template(),exam,'answers'))
    expect(answers).not.toContain('（　　）')
  })
  it('recognizes template order and page size',async()=>{const result=await inspectTemplate(await template());expect(result.sectionOrder).toEqual(['填空题','选择题','判断题','简答题']);expect(result.pageWidth).toBeCloseTo(210,0)})
  it('generates independent student and answer documents without leaking answers',async()=>{
    const source=await template(),exam=paper(),student=await xml(await buildPaperDocument(source,exam,'paper')),answers=await xml(await buildPaperDocument(source,exam,'answers'))
    expect(student).toContain('实验小学');expect(student).toContain('音乐期末考试');expect(student.replace(/<[^>]+>/g,'')).toContain('4. 简答题测试题');expect(student).toContain('每题 2 分');expect(student).toContain('选项甲');expect(student).toContain('判断：（')
    for(const secret of ['答案解析内容','参考简答内容','旧题不应保留','旧答案不应保留','参考答案'])expect(student).not.toContain(secret)
    expect(answers).toContain('错误（×）');expect(answers).toContain('参考简答内容');expect(answers).toContain('答案解析内容');expect(answers).not.toContain('选项甲');expect(student).toContain('<w:sectPr>')
  })
  it('replaces placeholders split across Word runs and inserts question sections',async()=>{
    const source=await template('<w:p><w:r><w:t>{{试卷</w:t></w:r><w:r><w:t>名称}}</w:t></w:r></w:p>'+p('{{试题}}'))
    const result=await xml(await buildPaperDocument(source,paper(),'paper'))
    expect(result).toContain('音乐期末考试');expect(result).not.toContain('{{');expect(result).toContain('判断题测试题')
  })
  it('escapes user content and preserves template header parts',async()=>{
    const source=await template();const zip=await JSZip.loadAsync(source);zip.file('word/header1.xml',`<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('{{学校}}')}</w:hdr>`)
    const exam=paper();exam.items[0].snapshot.title='甲 < 乙 & 丙';const result=await JSZip.loadAsync(await buildPaperDocument(await zip.generateAsync({type:'uint8array'}),exam,'paper'))
    expect(await result.file('word/document.xml')!.async('string')).toContain('甲 &lt; 乙 &amp; 丙');expect(await result.file('word/header1.xml')!.async('string')).toContain('实验小学')
  })
  it('exports every attached image in order and labels each listening material',async()=>{
    const exam=paper(),q=exam.items[0].snapshot
    q.attachments=[{id:'image-1',assetType:'image',name:'乐谱一'},{id:'audio-1',assetType:'audio',name:'片段一.wav'},{id:'image-2',assetType:'image',name:'乐谱二'},{id:'audio-2',assetType:'audio',name:'片段二.wav'}]
    q.hasImage=true;q.hasAudio=true
    const ids:string[]=[]
    const result=await JSZip.loadAsync(await buildPaperDocument(await template(),exam,'paper',async id=>{ids.push(id);return {bytes:new Uint8Array([1,2,3]),width:200,height:50}}))
    expect(ids).toEqual(['image-1','image-2'])
    expect(result.file('word/media/musicbank-1.png')).not.toBeNull();expect(result.file('word/media/musicbank-2.png')).not.toBeNull()
    const content=await result.file('word/document.xml')!.async('string')
    expect(content).toContain('片段一.wav');expect(content).toContain('片段二.wav')
  })
  it('embeds music images and fails clearly if assets are missing',async()=>{
    const exam=paper();exam.items[0].snapshot.imageAssetId='image';exam.items[0].snapshot.hasImage=true;const source=await template()
    await expect(buildPaperDocument(source,exam,'paper')).rejects.toThrow('图片无法读取')
    const result=await JSZip.loadAsync(await buildPaperDocument(source,exam,'paper',async()=>({bytes:new Uint8Array([1,2,3]),width:400,height:100})))
    expect(result.file('word/media/musicbank-1.png')).not.toBeNull();expect(await result.file('word/document.xml')!.async('string')).toContain('musicbankImage1');expect(await result.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/musicbank-1.png')
  })
  it('removes author template links while preserving cached document styles',async()=>{
    const zip=await JSZip.loadAsync(await template())
    zip.file('word/_rels/settings.xml.rels','<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" TargetMode="External" Target="file:///author/private.dotx"/></Relationships>')
    zip.file('word/settings.xml','<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:attachedTemplate/></w:settings>')
    const result=await JSZip.loadAsync(await buildPaperDocument(await zip.generateAsync({type:'uint8array'}),paper(),'paper'))
    expect(await result.file('word/_rels/settings.xml.rels')!.async('string')).not.toContain('private.dotx')
    expect(await result.file('word/settings.xml')!.async('string')).not.toContain('attachedTemplate')
  })
  it('normalizes floating student fields and keeps question stems with their answer area',async()=>{
    const box='<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="wps"><w:txbxContent>'+p('姓名：')+'</w:txbxContent></mc:Choice></mc:AlternateContent></w:p>'
    const result=await xml(await buildPaperDocument(await template(box+p('一、判断题')), {...paper(),items:[paper().items[2]],totalScore:2},'paper'))
    expect(result).not.toContain('AlternateContent');expect(result).toContain('姓名：____________')
    expect(result).toContain('<w:keepNext/>');expect(result).toContain('w:snapToGrid w:val="0"')
  })
  it('rejects unrelated files, duplicate headings, external links and missing question regions',async()=>{
    await expect(inspectTemplate(new Uint8Array([1,2,3]))).rejects.toThrow()
    await expect(inspectTemplate(await template(p('没有题型的文档')))).rejects.toThrow('未识别')
    await expect(inspectTemplate(await template(p('一、判断题')+p('二、判断题')))).rejects.toThrow('重复')
    const zip=await JSZip.loadAsync(await template());zip.file('word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>');await expect(inspectTemplate(await zip.generateAsync({type:'uint8array'}))).rejects.toThrow('外部链接')
    await expect(buildPaperDocument(await template(p('一、选择题')),paper(),'paper')).rejects.toThrow('填空题')
  })
})
describe('paper generation parameters',()=>{
  const plan=():PaperPlan=>({name:'音乐考试',grade:'六年级',category:'全部分类',audioMode:'不限',duration:40,totalScore:4,seed:'same',templateId:'template',examInfo:paper().examInfo!,rules:{选择题:{count:1,score:1},填空题:{count:1,score:1},判断题:{count:1,score:1},简答题:{count:1,score:1}}})
  it('uses fixed seed, template order and independent snapshots',async()=>{
    const summary=await inspectTemplate(await template()),pool=['填空题','选择题','判断题','简答题'].flatMap(type=>[question(type as QuestionRecord['type'],type+'1'),question(type as QuestionRecord['type'],type+'2')])
    const first=generatePaperPlan(plan(),pool,summary),second=generatePaperPlan(plan(),pool,summary)
    expect(first.items.map(i=>i.questionId)).toEqual(second.items.map(i=>i.questionId));expect(first.items.map(i=>i.snapshot.type)).toEqual(summary.sectionOrder)
    pool.forEach(q=>q.title='已修改');expect(first.items.every(i=>i.snapshot.title!=='已修改')).toBe(true);expect(first.templateSummary).toEqual(summary)
  })
  it('rejects invalid numeric settings, empty papers, mismatched scores and insufficient questions',async()=>{
    const summary=await inspectTemplate(await template()),pool=paper().items.map(i=>i.snapshot)
    for(const invalid of [-1,1.5,NaN,Infinity]){const config=plan();config.rules.判断题.count=invalid;expect(()=>generatePaperPlan(config,pool,summary)).toThrow()}
    const mismatch=plan();mismatch.totalScore=100;expect(()=>generatePaperPlan(mismatch,pool,summary)).toThrow('合计')
    expect(()=>generatePaperPlan(plan(),[],summary)).toThrow('只有 0 道')
    const filtered=plan();filtered.audioMode='仅含音频';expect(()=>generatePaperPlan(filtered,pool,summary)).toThrow()
    const zero=plan();Object.values(zero.rules).forEach(rule=>rule.count=0);expect(()=>generatePaperPlan(zero,pool,summary)).toThrow('总数')
  })
  it('grades false judgments as an answer, never as an empty response',()=>{
    expect(judgmentCorrect('false','false')).toBe(true);expect(judgmentCorrect('true','false')).toBe(false);expect(judgmentCorrect('','')).toBe(false);expect(answerText(question('判断题'))).toBe('错误（×）')
  })
})
