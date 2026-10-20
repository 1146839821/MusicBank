import type {QuestionRecord} from './types.js'
export interface ChoiceOption {id:string;text:string}
export function answerLetters(value?:string){return value?value.split(/[+,、，\s]+/).filter(Boolean):[]}
export function choiceOptions(question:Pick<QuestionRecord,'options'|'optionIds'>):ChoiceOption[]{
  return (question.options||[]).map((text,index)=>({id:question.optionIds?.[index]||`legacy-${index}`,text}))
}
export function choiceAnswerLetters(options:ChoiceOption[],correctIds:string[]){
  return options.flatMap((option,index)=>correctIds.includes(option.id)?[String.fromCharCode(65+index)]:[])
}
/** Stable identifiers are authoritative; letters are derived for display and legacy answer sheets. */
export function normalizeChoice<T extends QuestionRecord>(question:T):T{
  if(question.type!=='选择题')return question
  if(question.options!==undefined&&!Array.isArray(question.options))throw new Error('选项内容无效')
  if(question.optionIds!==undefined&&(!Array.isArray(question.optionIds)||question.optionIds.some(id=>typeof id!=='string'||!id.trim())))throw new Error('选项编号必须唯一且与选项一一对应')
  const options=choiceOptions(question),ids=options.map(option=>option.id)
  if(options.length>8)throw new Error('选择题最多支持 8 个选项')
  if(question.optionIds&&(question.optionIds.length!==options.length||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length))throw new Error('选项编号必须唯一且与选项一一对应')
  const correctIds=question.correctOptionIds??answerLetters(question.correctAnswer).flatMap(letter=>ids[letter.charCodeAt(0)-65]?[ids[letter.charCodeAt(0)-65]]:[])
  if(!Array.isArray(correctIds)||correctIds.some(id=>!ids.includes(id))||new Set(correctIds).size!==correctIds.length)throw new Error('正确答案引用了不存在或重复的选项')
  return {...question,optionIds:ids,correctOptionIds:correctIds,correctAnswer:options.length?choiceAnswerLetters(options,correctIds).join(','):question.correctAnswer}
}
