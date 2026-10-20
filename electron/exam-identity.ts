export function candidateName(value:unknown):string|undefined{
  if(value===undefined||value===null)return undefined
  if(typeof value!=='string'||value.trim().length>60||/[\u0000-\u001f\u007f]/.test(value))throw new Error('考生姓名应为 60 字以内的单行文字')
  return value.trim()||undefined
}
