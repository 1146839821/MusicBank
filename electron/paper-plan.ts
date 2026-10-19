import type { ExamInfo, PaperRecord, QuestionRecord, QuestionType, TemplateSummary } from './types.js'
export interface PaperPlan {
  name:string;grade:string;category:string;audioMode:string;duration:number;totalScore:number;seed:string;templateId:string;examInfo:ExamInfo
  rules:Record<QuestionType,{count:number;score:number}>
}
export function generatePaperPlan(plan:PaperPlan,questions:QuestionRecord[],template:TemplateSummary):PaperRecord{
  if(!plan.name.trim()||!plan.templateId)throw new Error('请填写试卷名称并选择试卷模板')
  if(!Number.isInteger(plan.duration)||plan.duration<1||plan.duration>600)throw new Error('考试时长需为 1 至 600 分钟')
  let total=0,count=0
  for(const [type,rule] of Object.entries(plan.rules)){
    if(!Number.isInteger(rule.count)||rule.count<0||rule.count>500||!Number.isFinite(rule.score)||rule.score<=0||rule.score>1000)throw new Error(`${type}的题数需为非负整数，每题分值需大于 0`)
    if(rule.count&&!template.sectionOrder.includes(type as QuestionType))throw new Error(`模板中没有${type}区域，请调整题数或更换模板`)
    total+=rule.count*rule.score;count+=rule.count
  }
  if(!count||count>500)throw new Error('试卷题目总数需为 1 至 500 道')
  if(!Number.isFinite(plan.totalScore)||plan.totalScore<=0||Math.abs(total-plan.totalScore)>.001)throw new Error(`题型分值合计 ${total} 分，请调整至目标总分 ${plan.totalScore} 分`)
  const pool=questions.filter(q=>q.status==='已发布'&&(plan.grade==='全部年级'||q.grade===plan.grade)&&(plan.category==='全部分类'||q.category===plan.category)&&(plan.audioMode==='不限'||(plan.audioMode==='仅含音频'?q.hasAudio:!q.hasAudio)))
  let random=2166136261
  for(const char of plan.seed||crypto.randomUUID()){random^=char.charCodeAt(0);random=Math.imul(random,16777619)>>>0}
  const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296}
  const items:PaperRecord['items']=[]
  for(const type of template.sectionOrder){
    const candidates=pool.filter(q=>q.type===type),rule=plan.rules[type]
    if(candidates.length<rule.count)throw new Error(`${type}符合条件的已发布试题只有 ${candidates.length} 道，需要 ${rule.count} 道`)
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]]}
    for(const q of candidates.slice(0,rule.count))items.push({position:items.length+1,questionId:q.id,score:rule.score,snapshot:JSON.parse(JSON.stringify(q))})
  }
  return {id:`PAPER-${crypto.randomUUID()}`,name:plan.name.trim(),grade:plan.grade,totalScore:Math.round(total*100)/100,durationMinutes:plan.duration,seed:plan.seed||undefined,templateId:plan.templateId,templateSummary:JSON.parse(JSON.stringify(template)),examInfo:{...plan.examInfo},items}
}
