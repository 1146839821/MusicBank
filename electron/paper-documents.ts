import {matchingReference,validateMatching} from './matching.js'
import {validateImageGrids} from './image-grids.js'
import {promptLayout} from './prompt-layout.js'
import {formatFillAnswers} from './fill-answers.js'
import { questionAttachments } from './question-assets.js'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { DocumentKind, ImageGridBlock, PaperRecord, QuestionType, TemplateSummary, TextRun } from './types.js'

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R='http://schemas.openxmlformats.org/package/2006/relationships'
export const questionTypes: QuestionType[]=['选择题','填空题','判断题','简答题','连线题']
const xmlEscape=(value: string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
function parse(xml:string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('模板不能包含外部 XML 实体')
  return new DOMParser({onError:()=>{throw new Error('模板 XML 格式无效')}}).parseFromString(xml,'application/xml')
}
type XmlNode=NonNullable<ReturnType<typeof parse>['documentElement']>
function descendants(node:XmlNode,local:string){return Array.from(node.getElementsByTagNameNS(W,local))}
function text(node:XmlNode){return descendants(node,'t').map(t=>t.textContent||'').join('')}
// Ignore floating text boxes when recognizing body markers or replacing a title.
function ownTexts(node:XmlNode){return descendants(node,'t').filter(t=>{let p=t.parentNode;while(p&&p!==node){if(p.localName==='txbxContent')return false;p=p.parentNode}return true})}
function ownText(node:XmlNode){return ownTexts(node).map(t=>t.textContent||'').join('')}
function replaceText(node:XmlNode,search:string,value:string) {
  if(!search)return
  let nodes=ownTexts(node),joined=nodes.map(n=>n.textContent||'').join(''),at=joined.indexOf(search)
  // Replace ranges across Word runs, preserving unrelated run formatting and drawings.
  while(at>=0){
    let offset=0
    for(const n of nodes){const original=n.textContent||'',end=offset+original.length
      if(end>at&&offset<at+search.length)n.textContent=original.slice(0,Math.max(0,at-offset))+(offset<=at?value:'')+original.slice(Math.min(original.length,Math.max(0,at+search.length-offset)))
      offset=end
    }
    nodes=ownTexts(node);joined=nodes.map(n=>n.textContent||'').join('');at=joined.indexOf(search,at+value.length)
  }
}
function sectionType(value:string):QuestionType|undefined {return questionTypes.find(type=>new RegExp(`^\\s*[一二三四五六七八九十0-9]+[、.．\\s]\\s*${type}`).test(value))}
async function openTemplate(bytes:Uint8Array){
  if(!bytes.byteLength||bytes.byteLength>15*1024*1024)throw new Error('请选择不超过 15MB 的 Word .docx 模板')
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:false})
  const entries=Object.values(zip.files)
  if(entries.length>1500||entries.reduce((sum,file)=>sum+((file as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize||0),0)>64*1024*1024)throw new Error('模板解压后过大')
  for(const file of entries){
    if(file.name.includes('..')||/vbaProject|embeddings\/|activeX\//i.test(file.name))throw new Error('模板包含不支持的嵌入对象或宏')
    if(file.name.endsWith('.rels')){
      const relations=parse(await file.async('string'))
      for(const relation of Array.from(relations.getElementsByTagName('Relationship')).filter(r=>r.getAttribute('TargetMode')==='External')){
        // Office stores the author's original template path here; cached styles are self-contained.
        if(relation.getAttribute('Type')?.endsWith('/attachedTemplate'))relation.parentNode!.removeChild(relation)
        else throw new Error('请移除模板中的外部链接或链接图片，再重新上传')
      }
      zip.file(file.name,new XMLSerializer().serializeToString(relations))
    }
  }
  const settings=zip.file('word/settings.xml')
  if(settings){const part=parse(await settings.async('string'));for(const node of Array.from(part.getElementsByTagNameNS(W,'attachedTemplate')))node.parentNode!.removeChild(node);zip.file('word/settings.xml',new XMLSerializer().serializeToString(part))}
  const content=zip.file('word/document.xml')
  if(!content||!zip.file('[Content_Types].xml'))throw new Error('文件不是有效的 Word .docx 文档')
  const doc=parse(await content.async('string')),body=doc.getElementsByTagNameNS(W,'body')[0]
  if(!body)throw new Error('模板缺少正文')
  const blocks=Array.from(body.childNodes).filter(node=>node.nodeType===1) as XmlNode[]
  return {zip,doc,body,blocks}
}
export async function inspectTemplate(bytes:Uint8Array):Promise<TemplateSummary>{
  const {doc,blocks}=await openTemplate(bytes)
  const sections=blocks.map(block=>sectionType(ownText(block))).filter(Boolean) as QuestionType[]
  const marker=blocks.filter(block=>ownText(block).trim()==='{{试题}}')
  if(marker.length>1||new Set(sections).size!==sections.length)throw new Error('模板中题型标题或 {{试题}} 插入位置重复')
  if(marker.length&&sections.length)throw new Error('请使用题型标题或 {{试题}} 中的一种模板方式')
  if(!marker.length&&!sections.length)throw new Error('未识别到题型区域：请使用“一、选择题”等标题，或单独一段 {{试题}}')
  const size=doc.getElementsByTagNameNS(W,'pgSz')[0]
  const pageWidth=Number(size?.getAttribute('w:w')||11906)/1440*25.4,pageHeight=Number(size?.getAttribute('w:h')||16838)/1440*25.4
  if(!Number.isFinite(pageWidth)||!Number.isFinite(pageHeight)||pageWidth<80||pageWidth>500||pageHeight<80||pageHeight>600)throw new Error('模板纸张尺寸不受支持')
  return {sectionOrder:marker.length?questionTypes:sections,mode:marker.length?'placeholder':'sections',pageWidth,pageHeight,warnings:doc.getElementsByTagNameNS(W,'txbxContent').length?['模板含浮动文本框，打印前请检查预览中的位置。']:[]}
}
export function answerText(question:PaperRecord['items'][number]['snapshot']){
  if(question.type==='连线题'&&question.matching)return matchingReference(question.matching)
  if(question.type==='判断题')return question.correctAnswer==='true'?'正确（√）':question.correctAnswer==='false'?'错误（×）':'未设置答案'
  if(question.type==='选择题')return (question.correctAnswer||'未设置答案').replace(/,/g,'、')
  if(question.type==='填空题')return formatFillAnswers(question.fillAnswers)
  return question.referenceAnswer||'未设置参考答案'
}
function paragraph(value:string,options:{bold?:boolean;size?:number;space?:number;keepNext?:boolean;runs?:TextRun[];align?:'left'|'center'|'right'}={}){
  const runs=options.runs?.map(run=>run.text).join('')===value?options.runs:[{text:value,bold:options.bold}]
  const content=runs!.map(run=>`<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="${options.size||24}"/>${run.bold?'<w:b/>':''}${run.italic?'<w:i/>':''}</w:rPr>${run.text.split('\n').map(line=>`<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('<w:br/>')}</w:r>`).join('')
  return `<w:p><w:pPr><w:snapToGrid w:val="0"/>${options.align?`<w:jc w:val="${options.align}"/>`:''}<w:spacing w:before="0" w:after="${options.space??80}" w:line="380" w:lineRule="exact"/>${options.keepNext?'<w:keepNext/>':''}<w:keepLines/><w:widowControl/></w:pPr>${content}</w:p>`
}
export type ImageResolver=(id:string)=>Promise<{bytes:Uint8Array;width:number;height:number}>
export async function buildPaperDocument(bytes:Uint8Array,paper:PaperRecord,kind:DocumentKind,resolveImage?:ImageResolver):Promise<Uint8Array>{
  const summary=await inspectTemplate(bytes),{zip,doc,body,blocks}=await openTemplate(bytes)
  if(!paper.name.trim()||!paper.items.length||paper.items.length>500||!Number.isFinite(paper.durationMinutes)||paper.durationMinutes<=0)throw new Error('试卷信息或题目数量无效')
  if(paper.items.some(item=>!Number.isFinite(item.score)||item.score<=0||!questionTypes.includes(item.snapshot.type)))throw new Error('试卷题型或分值无效')
  const actual=paper.items.reduce((sum,item)=>sum+item.score,0)
  if(Math.abs(actual-paper.totalScore)>.001)throw new Error('试卷总分与题目分值不一致')
  for(const item of paper.items)if(item.snapshot.type!=='连线题'&&!summary.sectionOrder.includes(item.snapshot.type))throw new Error(`所选模板没有“${item.snapshot.type}”区域，请更换模板`)
  // Word/WPS floating identity boxes are not portable to PDF engines. Keep their
  // content as an inline information row in both Word and the print preview.
  let normalizedIdentity=false
  for(const alternate of Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/markup-compatibility/2006','AlternateContent'))){
    const boxes=descendants(alternate,'txbxContent')
    if(boxes.length&&boxes.every(box=>/^(?:(?:班级|姓名|得分)[：:]?[\s_＿]*)+$/.test(text(box).trim()))){const parent=alternate.parentNode!;parent.removeChild(alternate);let paragraphNode=parent;while(paragraphNode.parentNode&&paragraphNode.parentNode!==body)paragraphNode=paragraphNode.parentNode;if(paragraphNode.parentNode===body&&!text(paragraphNode as XmlNode).trim()&&!descendants(paragraphNode as XmlNode,'drawing').length&&!descendants(paragraphNode as XmlNode,'pict').length)body.removeChild(paragraphNode);normalizedIdentity=true}
  }
  const info=paper.examInfo,values:Record<string,string>={'试卷名称':paper.name,'学校':info?.school||'','学年':info?.schoolYear||'','学期':info?.term||'','学科':info?.subject||'音乐','年级':paper.grade,'考试日期':info?.examDate||'','考试时长':String(paper.durationMinutes),'总分':String(paper.totalScore),'考试说明':info?.instructions||''}
  for(const file of Object.values(zip.files).filter(f=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(f.name))){
    const part=file.name==='word/document.xml'?doc:parse(await file.async('string'))
    for(const p of Array.from(part.getElementsByTagNameNS(W,'p'))){
      for(const [key,value] of Object.entries(values))replaceText(p,`{{${key}}}`,value)
      replaceText(p,'XX学校',info?.school||'学校')
      replaceText(p,'XXXX年XX学期',[info?.schoolYear,info?.term].filter(Boolean).join(' ')||'音乐学科')
      if(ownText(p).trim()==='期末检测试卷')replaceText(p,'期末检测试卷',paper.name)
    }
    if(file.name!=='word/document.xml')zip.file(file.name,new XMLSerializer().serializeToString(part))
  }
  const importXml=(xml:string)=>{
    const fragment=parse(`<w:root xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</w:root>`)
    return Array.from(fragment.documentElement!.childNodes).map(n=>doc.importNode(n,true))
  }
  // Drop the template's answer area in both outputs. Teacher answers are rebuilt from snapshots.
  const answerStart=blocks.findIndex(block=>/^\s*参考答案\s*$/.test(ownText(block)))
  if(answerStart>=0)for(const block of blocks.slice(answerStart))if(block.localName!=='sectPr'&&block.parentNode===body)body.removeChild(block)
  let relDoc=parse(await zip.file('word/_rels/document.xml.rels')?.async('string')||`<Relationships xmlns="${R}"/>`)
  const contentTypes=parse(await zip.file('[Content_Types].xml')!.async('string'))
  let imageCounter=0
  const pageWidth=Math.min((summary.pageWidth-55)/25.4*914400,4800000)
  async function imageXml(assetId:string,maxWidth=pageWidth,maxHeight=4800000,fit='contain',align='center'){
      if(!resolveImage)throw new Error('题目图片无法读取')
      const image=await resolveImage(assetId)
      if(!image.bytes.length||!Number.isFinite(image.width)||!Number.isFinite(image.height)||image.width<=0||image.height<=0)throw new Error('题目图片无效')
      const id=`musicbankImage${++imageCounter}`,name=`musicbank-${imageCounter}.png`
      zip.file(`word/media/${name}`,image.bytes)
      const relation=relDoc.createElementNS(R,'Relationship');relation.setAttribute('Id',id);relation.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');relation.setAttribute('Target',`media/${name}`);relDoc.documentElement!.appendChild(relation)
      const naturalRatio=image.width/image.height,boxHeight=maxHeight||4800000,scale=Math.min(1,boxHeight/(maxWidth/naturalRatio)),cx=Math.round(maxWidth*scale),cy=Math.round(maxWidth/naturalRatio*scale)
      const boxRatio=maxWidth/boxHeight,cropX=fit==='cover'&&naturalRatio>boxRatio?Math.round((1-boxRatio/naturalRatio)*50000):0,cropY=fit==='cover'&&naturalRatio<boxRatio?Math.round((1-naturalRatio/boxRatio)*50000):0
      const finalWidth=fit==='cover'?Math.round(maxWidth):cx,finalHeight=fit==='cover'?Math.round(boxHeight):cy
      return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${finalWidth}" cy="${finalHeight}"/><wp:docPr id="${10000+imageCounter}" name="题目图片 ${imageCounter}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:srcRect l="${cropX}" r="${cropX}" t="${cropY}" b="${cropY}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${finalWidth}" cy="${finalHeight}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  }
  function table(rows:string[][],columns:number,gap=12,keepTogether=false){
    const width=Math.floor(pageWidth/635),cellWidth=Math.floor(width/columns),margin=Math.round(gap*15/2)
    const rowXml=rows.map((row,rowIndex)=>{
      const cells=Array.from({length:columns},(_,index)=>{
        let content=row[index]||paragraph('')
        // Bind matching rows to each other, but let the next question paginate independently.
        if(keepTogether&&rowIndex<rows.length-1)content=content.replace(/<w:pPr>/g,'<w:pPr><w:keepNext/>')
        return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`
      }).join('')
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`
    }).join('')
    const grid=Array.from({length:columns},()=>`<w:gridCol w:w="${cellWidth}"/>`).join('')
    return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="${margin}" w:type="dxa"/><w:right w:w="${margin}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`
  }
  async function gridsXml(grids:ImageGridBlock[]){
    let result=''
    for(const grid of grids){const cells=[];for(const item of grid.items)cells.push(await imageXml(item.assetId,pageWidth/grid.columns-grid.gap*9525,grid.imageHeight*9525,grid.fit,grid.align==='start'?'left':grid.align==='end'?'right':'center')+paragraph(item.caption,{size:22,align:grid.align==='start'?'left':grid.align==='end'?'right':'center'}));const rows=[];for(let i=0;i<cells.length;i+=grid.columns)rows.push(cells.slice(i,i+grid.columns));result+=table(rows,grid.columns,grid.gap)}
    return result
  }
  async function matchingXml(q:PaperRecord['items'][number]['snapshot']){
    const data=validateMatching(q.matching!),sources=[...data.sources].sort((a,b)=>a.order-b.order),order=data.targetOrder||[...data.targets].sort((a,b)=>a.order-b.order).map(item=>item.id),columns=Math.min(4,sources.length)
    const sourceCells=[],targetCells=[]
    for(const [index,item] of sources.entries())sourceCells.push(paragraph(String(index+1),{bold:true})+(item.contentType==='image'?await imageXml(item.assetId!,pageWidth/columns-160000,1200000):paragraph(item.text)))
    for(const [index,id] of order.entries()){const item=data.targets.find(item=>item.id===id)!;targetCells.push(paragraph(`${String.fromCharCode(65+index)}. ${item.contentType==='text'?item.text:''}`,{bold:true})+(item.contentType==='image'?await imageXml(item.assetId!,pageWidth/columns-160000,1200000):''))}
    const rows:string[][]=[]
    for(let index=0;index<sources.length;index+=columns)rows.push(sourceCells.slice(index,index+columns))
    rows.push(Array.from({length:columns},()=>paragraph('\n\n',{space:0})))
    for(let index=0;index<targetCells.length;index+=columns)rows.push(targetCells.slice(index,index+columns))
    return table(rows,columns,12,true)+paragraph('请将上方项目与下方名称连线。',{size:20})
  }
  async function questionXml(item:PaperRecord['items'][number]){
    const q=item.snapshot;validateImageGrids(q.imageGrids);if(q.type==='连线题')validateMatching(q.matching!);const label=`${item.position}. `
    if(kind==='answers')return paragraph(`${label}${answerText(q)}（${item.score} 分）`,{bold:true})+(q.explanation?paragraph(`解析：${q.explanation}`):'')
    const suffix=`${q.type==='选择题'&&q.answerMode==='multiple'?'（多选）':''}${q.type==='选择题'?'（　　）':''}（${item.score} 分）`
    const layout=promptLayout(q.title,q.titleRuns,q.imageGrids)
    let xml=layout[0]?.kind==='image-grid'?paragraph(label,{keepNext:true}):''
    for(const [index,block] of layout.entries()){
      if(block.kind==='image-grid'){xml+=await gridsXml([block.grid]);continue}
      const prefix=index===0?label:'',ending=index===layout.length-1?suffix:''
      xml+=paragraph(`${prefix}${block.text}${ending}`,{keepNext:true,runs:[{text:prefix},...block.runs,{text:ending}]})
    }
    if(layout[layout.length-1]?.kind==='image-grid')xml+=paragraph(suffix,{keepNext:true})
    const images=questionAttachments(q).filter(item=>item.assetType==='image')
    for(const attachment of images)xml+=await imageXml(attachment.id)
    if(q.type==='连线题')xml+=await matchingXml(q)
    if(!images.length&&q.hasImage&&!q.imageGrids?.some(grid=>grid.items.length)&&!q.matching)throw new Error(`第 ${item.position} 题缺少图片素材，请重新导入图片后再组卷`)
    const audio=questionAttachments(q).filter(item=>item.assetType==='audio')
    for(const [index,attachment] of audio.entries())xml+=paragraph(`【听音材料 ${item.position}-${index+1}：${attachment.name}，由监考教师统一播放】`,{size:20})
    if(q.hasAudio&&!audio.length)xml+=paragraph(`【听音材料 ${item.position}：${q.audioName||'音乐片段'}，由监考教师统一播放】`,{size:20})
    if(q.type==='选择题')xml+=paragraph((q.options||[]).map((option,i)=>`${String.fromCharCode(65+i)}. ${option}`).join('\n'))
    else if(q.type==='判断题')xml+=paragraph('判断：（　　）　正确请填 √，错误请填 ×。')
    else if(q.type==='简答题')xml+=paragraph('________________________________________________________________\n\n________________________________________________________________\n\n________________________________________________________________')
    else if(q.type!=='连线题')xml+=paragraph('答：____________________________________________________________')
    return xml
  }
  const metadata=(kind==='paper'&&(normalizedIdentity||!text(body).includes('姓名'))?paragraph('班级：____________　姓名：____________　得分：____________',{size:24}):'')+paragraph(`${paper.grade}　${info?.subject||'音乐'}　考试时长 ${paper.durationMinutes} 分钟　满分 ${paper.totalScore} 分${info?.examDate?'　'+info.examDate:''}`,{size:20})+(info?.instructions?paragraph(info.instructions,{size:20}):'')
  const first=summary.mode==='placeholder'?blocks.find(b=>ownText(b).trim()==='{{试题}}'):blocks.find(b=>sectionType(ownText(b)))
  if(!first||!first.parentNode)throw new Error('模板题型区域无法定位')
  const insertBefore=(xml:string,before:XmlNode|null)=>{for(const node of importXml(xml))body.insertBefore(node,before)}
  insertBefore((kind==='answers'?paragraph('参考答案与评分建议',{bold:true,size:30}):'')+metadata,first)
  if(summary.mode==='placeholder'){
    let ordinal=0
    for(const type of summary.sectionOrder){
      const items=paper.items.filter(item=>item.snapshot.type===type);if(!items.length)continue
      let xml=paragraph(`${['一','二','三','四','五'][ordinal++]}、${type}（共 ${items.length} 题，共 ${items.reduce((s,i)=>s+i.score,0)} 分）`,{bold:true,keepNext:true})
      for(const item of items)xml+=await questionXml(item)
      insertBefore(xml,first)
    }
    body.removeChild(first)
  }else{
    const headings=blocks.filter(b=>b.parentNode===body&&sectionType(ownText(b)))
    let ordinal=0
    for(const heading of headings){
      const type=sectionType(ownText(heading))!,items=paper.items.filter(i=>i.snapshot.type===type)
      // Remove sample question material up to the next section, retaining section properties.
      let sibling=heading.nextSibling
      while(sibling&&sibling.localName!=='sectPr'&&!headings.includes(sibling as XmlNode)) {const next=sibling.nextSibling;body.removeChild(sibling);sibling=next}
      if(!items.length){body.removeChild(heading);continue}
      const sum=items.reduce((s,i)=>s+i.score,0),same=items.every(i=>i.score===items[0].score)
      replaceText(heading,ownText(heading),`${['一','二','三','四','五'][ordinal++]}、${type}（共 ${items.length} 题，${same?'每题 '+items[0].score+' 分，':''}共 ${sum} 分）`)
      const ppr=heading.getElementsByTagNameNS(W,'pPr')[0]
      if(ppr){let keep=ppr.getElementsByTagNameNS(W,'keepNext')[0];if(!keep){keep=doc.createElementNS(W,'w:keepNext');ppr.appendChild(keep)}keep.setAttribute('w:val','1')}
      let xml='';for(const item of items)xml+=await questionXml(item)
      insertBefore(xml,sibling as XmlNode|null)
    }
  }
  if(summary.mode==='sections'&&!summary.sectionOrder.includes('连线题')){const items=paper.items.filter(item=>item.snapshot.type==='连线题');if(items.length){let xml=paragraph(`连线题（共 ${items.length} 题，共 ${items.reduce((sum,item)=>sum+item.score,0)} 分）`,{bold:true,keepNext:true});for(const item of items)xml+=await questionXml(item);insertBefore(xml,Array.from(body.childNodes).find(node=>node.localName==='sectPr') as XmlNode||null)}}
  if(imageCounter&&!Array.from(contentTypes.getElementsByTagName('Default')).some(n=>n.getAttribute('Extension')==='png')){const node=contentTypes.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Default');node.setAttribute('Extension','png');node.setAttribute('ContentType','image/png');contentTypes.documentElement!.appendChild(node)}
  zip.file('word/document.xml',new XMLSerializer().serializeToString(doc))
  zip.file('word/_rels/document.xml.rels',new XMLSerializer().serializeToString(relDoc))
  zip.file('[Content_Types].xml',new XMLSerializer().serializeToString(contentTypes))
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'})
}
