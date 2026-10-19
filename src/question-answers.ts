export function judgmentLabel(value?:string){return value==='true'?'正确（√）':value==='false'?'错误（×）':'未设置'}
export function judgmentCorrect(answer:string|undefined,expected:string|undefined){return (expected==='true'||expected==='false')&&answer===expected}
