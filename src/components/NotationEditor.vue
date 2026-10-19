<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { scoreMeasures, TICKS_PER_BEAT, durations, emptyScore, keyTonic, newNote, noteName, scorePlayback, toggleTies, normalizeTies, disconnectTies, duplicateNotes, scoreVoices, voiceNotes, replaceVoiceNotes, addScoreVoice, removeScoreVoice, noteTones, withChordTone, updateTone, removeTone, parseScore, transposeNotes, type Duration, type ScoreDocument, type ScoreNote } from '../notation/score'
import { layoutScore, renderScore } from '../notation/render'

const props = defineProps<{ source: string; busy?: boolean }>()
const emit = defineEmits<{ close: []; change: [source: string]; export: [svg: string] }>()
const score = ref<ScoreDocument>(emptyScore())
const selected = ref<string[]>([])
const caret = ref(0)
const activeVoice = ref(1)
const voices = computed(() => scoreVoices(score.value))
const activeNotes = computed(() => voiceNotes(score.value,activeVoice.value))
const auditionMode = ref('all')
const voiceCarets = new Map<number,number>()
const duration = ref<Duration>(4)
const mode = ref<'insert'|'replace'|'chord'>('insert')
const zoom = ref(100)
const sourceVisible = ref(false)
const sourceText = ref('')
const message = ref('')
const history = ref<string[]>([]), future = ref<string[]>([])
const canvas = ref<HTMLElement>()
const current = computed(() => score.value.notes.find(note => selected.value.includes(note.id)))
const toneSelection = ref({id:'',index:0})
const toneIndex = computed(() => current.value?.id === toneSelection.value.id ? Math.min(toneSelection.value.index,current.value.chord?.length||0) : 0)
const currentTones = computed(() => current.value?.kind === 'note' ? noteTones(current.value) : [])
const svg = computed(() => renderScore(score.value, selected.value, caret.value, true, activeVoice.value))
const measureChecks=computed(()=>scoreMeasures(score.value))
const measureIssues=computed(()=>measureChecks.value.filter(measure=>measure.status!=='complete'))
const measureSummary=computed(()=>measureIssues.value.length?measureIssues.value.map(measure=>`${voices.value.find(voice=>voice.id===measure.voice)?.name} 第 ${measure.number} 小节${measure.status==='short'?'缺':'超出'} ${Number((Math.abs(measure.expected-measure.ticks)/TICKS_PER_BEAT*score.value.beatUnit/4).toFixed(3))} 拍`).join('；'):`${measureChecks.value.length} 个小节时值正确`)
const noteCount = computed(() => score.value.notes.filter(note => note.kind==='note'||note.kind==='rest').length)
let sound: AudioContext | undefined
const playing = ref(false)
let playbackRevision = 0
let playbackTimer: ReturnType<typeof setTimeout> | undefined
watch(() => props.source, source => {
  if(source === JSON.stringify(score.value)) return
  try { score.value = parseScore(source); activeVoice.value = scoreVoices(score.value)[0].id; caret.value = activeNotes.value.length; selected.value=[]; history.value=[]; future.value=[] }
  catch { message.value='源稿格式不受支持，请先检查内容。' }
}, { immediate:true })
function syncVoice() {
  if (!voices.value.some(voice=>voice.id===activeVoice.value)) activeVoice.value=voices.value[0].id
  caret.value=Math.min(caret.value,activeNotes.value.length)
  selected.value=[]
}
function switchVoice(id: number, reveal = false) {
  if (id===activeVoice.value) return
  stop();voiceCarets.set(activeVoice.value,caret.value);activeVoice.value=id
  caret.value=Math.min(voiceCarets.get(id)??activeNotes.value.length,activeNotes.value.length)
  selected.value=[];message.value=''
  if(reveal) void nextTick(()=>{
    const stave=Array.from(canvas.value?.querySelectorAll('rect[data-voice]')||[]).find(element=>Number(element.getAttribute('data-voice'))===id)
    stave?.scrollIntoView({block:'nearest',inline:'nearest'})
  })
}
function addVoice() {
  try {
    const updated=addScoreVoice(score.value)
    edit(()=>{score.value=updated})
    switchVoice(updated.voices![updated.voices!.length-1].id,true)
    message.value='新声部从第 1 拍开始；需要延后进入时可先录入休止符。'
  } catch(error) { message.value=(error as Error).message }
}
function removeVoice() {
  try {
    const updated=removeScoreVoice(score.value,activeVoice.value)
    edit(()=>{score.value=updated;syncVoice()})
    message.value='声部已移除，可使用撤销恢复。'
  } catch(error) { message.value=(error as Error).message }
}
function renameVoice(event: Event) {
  const name=(event.target as HTMLInputElement).value.trim().slice(0,32)
  if (!name) { (event.target as HTMLInputElement).value=voices.value.find(voice=>voice.id===activeVoice.value)!.name; return }
  edit(()=>{score.value.voices=voices.value.map(voice=>({...voice,...(voice.id===activeVoice.value?{name}:{})}))})
}
function muteVoice() {
  edit(()=>{score.value.voices=voices.value.map(voice=>({...voice,...(voice.id===activeVoice.value?{muted:!voice.muted}:{})}))})
}
function spliceVoice(index: number, count: number, ...notes: ScoreNote[]) {
  const items=[...activeNotes.value];items.splice(index,count,...notes)
  score.value=replaceVoiceNotes(score.value,activeVoice.value,items)
}
function save(before: string) {
  score.value=normalizeTies(score.value)
  if(before===JSON.stringify(score.value)) return
  history.value.push(before)
  if(history.value.length>100) history.value.shift()
  future.value=[]
  emit('change',JSON.stringify(score.value))
  revealSelection()
}
function revealSelection() {
  void nextTick(() => {
    const element = Array.from(canvas.value?.querySelectorAll('[data-note-id]') || []).find(item => item.getAttribute('data-note-id') === selected.value[0])
    element?.scrollIntoView({block:'nearest',inline:'nearest'})
  })
}
function edit(action: () => void) { stop(); message.value=''; const before=JSON.stringify(score.value); action(); save(before) }
function undo() {
  const previous=history.value.pop(); if(!previous) return
  stop(); future.value.push(JSON.stringify(score.value)); score.value=parseScore(previous); syncVoice(); emit('change',previous); message.value='已撤销'
}
function redo() {
  const next=future.value.pop(); if(!next) return
  stop(); history.value.push(JSON.stringify(score.value)); score.value=parseScore(next); syncVoice(); emit('change',next); message.value='已重做'
}
function insert(note: ScoreNote) {
  if (mode.value === 'chord' && note.kind === 'note') {
    if (selected.value.length !== 1 || current.value?.kind !== 'note') { message.value='先在谱面上选择一个音符，再叠加和弦音。'; return }
    try {
      const updated = withChordTone(current.value,{pitch:note.pitch,accidental:note.accidental})
      edit(() => Object.assign(current.value!,updated))
      toneSelection.value={id:updated.id,index:noteTones(updated).length-1}
      message.value='和弦音已叠加；点击音头或下方音名可分别调整。'
    } catch(error) { message.value=(error as Error).message }
    return
  }
  if (score.value.notes.length >= 2000 && !(mode.value === 'replace' && current.value && ['note','rest'].includes(note.kind))) { message.value='单份乐谱最多支持 2000 个元素。'; return }
  edit(()=>{
    if(mode.value==='replace' && current.value && (note.kind==='note'||note.kind==='rest')) {
      Object.assign(current.value,{kind:note.kind,pitch:note.pitch,duration:note.duration,chord:undefined,tieTo:undefined})
    } else {
      spliceVoice(caret.value,0,note); caret.value++; selected.value=[note.id]
    }
  })
}
function pitch(degree: number) { insert(newNote(degree-1+(score.value.view==='jianpu'?keyTonic(score.value.key):0),duration.value,degree===0?'rest':'note')); canvas.value?.focus() }
function setDuration(value: Duration) {
  duration.value=value
  edit(()=>{score.value.notes.forEach(note=>{if(selected.value.includes(note.id)&&['note','rest'].includes(note.kind))note.duration=value})})
}
function modify(changes: Partial<ScoreNote>) {
  if(!selected.value.length) { message.value='请先在谱面上选择音符。';return }
  edit(()=>{score.value.notes.forEach(note=>{if(selected.value.includes(note.id))Object.assign(note,changes)})})
}
function transpose(amount: number) {
  const changed=transposeNotes(score.value.notes.filter(note=>selected.value.includes(note.id)),amount)
  edit(()=>{score.value.notes=score.value.notes.map(note=>changed.find(item=>item.id===note.id)||note)})
}
function changeTone(changes: Parameters<typeof updateTone>[2]) {
  if (!current.value || current.value.kind !== 'note') { message.value='请先选择要调整的音符。'; return }
  try {
    const updated=updateTone(current.value,toneIndex.value,changes)
    edit(()=>Object.assign(current.value!,updated))
  } catch(error) { message.value=(error as Error).message }
}
function accidental(value: ScoreNote['accidental']) {
  if (selected.value.length === 1 && current.value?.kind === 'note') changeTone({accidental:value})
  else modify({accidental:value})
}
function deleteTone() {
  if (!current.value || currentTones.value.length < 2) return
  edit(()=>Object.assign(current.value!,removeTone(current.value!,toneIndex.value)))
  toneSelection.value={id:current.value!.id,index:0}
}

function deleteSelection(backward = false) {
  edit(()=>{
    if(selected.value.length) {
      const first=activeNotes.value.findIndex(n=>selected.value.includes(n.id))
      score.value.notes=score.value.notes.filter(n=>!selected.value.includes(n.id));caret.value=Math.max(0,first)
    } else if(caret.value>0&&backward) {spliceVoice(--caret.value,1)}
    else spliceVoice(caret.value,1)
    selected.value=[]
  })
}
function addBar(bar: ScoreNote['bar']) { const note=newNote(0,duration.value,'bar'); note.bar=bar;insert(note) }
function tieSelection() {
  try { const updated=toggleTies(score.value,selected.value);edit(()=>{score.value=updated}) }
  catch(error) { message.value=(error as Error).message }
}
function clearMarks() {
  edit(()=>{
    score.value=disconnectTies(score.value,selected.value)
    score.value.notes.forEach(note=>{if(selected.value.includes(note.id)){note.mark='';note.slur=undefined;note.tuplet=undefined}})
  })
}
function group(field: 'slur'|'tuplet') {
  const notes=score.value.notes.filter(n=>selected.value.includes(n.id)&&n.kind==='note')
  if(notes.length<(field==='tuplet'?3:2)) { message.value=field==='tuplet'?'按住 Shift 选择三个音符后设置三连音。':'按住 Shift 选择至少两个音符。';return }
  if(field==='tuplet'&&notes.length!==3) {message.value='三连音需要恰好选择三个音符。';return}
  const value=notes.every(n=>n[field])?undefined:crypto.randomUUID()
  edit(()=>{notes.forEach(n=>{n[field]=value})})
}
const copied = ref<ScoreNote[]>([])
function copy(cut=false) {
  copied.value=score.value.notes.filter(n=>selected.value.includes(n.id)).map(n=>({...n,chord:n.chord?.map(tone=>({...tone}))}))
  if(cut&&copied.value.length)deleteSelection()
  if(copied.value.length)message.value=`已复制 ${copied.value.length} 个元素`
}
function paste() {
  if(!copied.value.length)return
  if(score.value.notes.length + copied.value.length > 2000) { message.value='粘贴后超过单份乐谱 2000 个元素的限制。'; return }
  edit(()=>{
    const notes=duplicateNotes(copied.value)
    spliceVoice(caret.value,0,...notes);caret.value+=notes.length;selected.value=notes.map(n=>n.id)
  })
}
function selectAll() {selected.value=activeNotes.value.map(n=>n.id)}
function keydown(event: KeyboardEvent) {
  if((event.target as HTMLElement).closest('input,textarea,select'))return
  const command=event.metaKey||event.ctrlKey
  if(command){
    const key=event.key.toLowerCase()
    if(['z','y','a','c','x','v'].includes(key))event.preventDefault()
    if(key==='z')event.shiftKey?redo():undo()
    if(key==='y')redo()
    if(key==='a')selectAll()
    if(key==='c')copy()
    if(key==='x')copy(true)
    if(key==='v')paste()
    return
  }
  if(/^[0-7]$/.test(event.key)){event.preventDefault();pitch(Number(event.key));return}
  const letter='cdefgab'.indexOf(event.key.toLowerCase())
  if(letter>=0&&event.key.length===1){event.preventDefault();pitch(letter+1);return}
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();transpose((event.key==='ArrowUp'?1:-1)*(event.shiftKey?7:1))}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();caret.value=Math.max(0,Math.min(activeNotes.value.length,caret.value+(event.key==='ArrowRight'?1:-1)));selected.value=[]
  }
  if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();deleteSelection(event.key==='Backspace')}
  if(event.key==='.') {event.preventDefault();modify({dots:((current.value?.dots||0)+1)%3})}
  if(event.key==='|'){event.preventDefault();addBar('single')}
  if(event.key==='Enter'){event.preventDefault();insert(newNote(0,4,'break'))}
  if(event.key==='Escape'){selected.value=[];stop()}
}
function point(event: PointerEvent|MouseEvent) {
  const bounds=canvas.value!.querySelector('svg')!.getBoundingClientRect()
  return {x:(event.clientX-bounds.left)*1000/bounds.width,y:(event.clientY-bounds.top)*layoutScore(score.value).height/bounds.height}
}
let drag: {id:string;startY:number;pitch:number;tone:number;before:string;moved:boolean;unit:number}|undefined
function pointerdown(event: PointerEvent) {
  if(event.button!==0)return
  canvas.value?.focus()
  const target=(event.target as Element).closest('[data-note-id]')
  const {x,y}=point(event)
  if(target){
    const id=target.getAttribute('data-note-id')!
    const clicked=score.value.notes.find(n=>n.id===id)!
    switchVoice(clicked.voice??1)
    const index=activeNotes.value.findIndex(n=>n.id===id)
    if(event.shiftKey&&selected.value.length){const anchor=activeNotes.value.findIndex(n=>n.id===selected.value[0]);selected.value=activeNotes.value.slice(Math.min(anchor,index),Math.max(anchor,index)+1).map(n=>n.id)}
    else selected.value=[id]
    caret.value=index+1
    const note=activeNotes.value[index]
    const toneTarget=(event.target as Element).closest('[data-tone-index]')
    const tone=Number(toneTarget?.getAttribute('data-tone-index')||0)
    toneSelection.value={id,index:tone}
    duration.value=note.duration
    if(note.kind==='note'&&!event.shiftKey){drag={id,startY:y,pitch:noteTones(note)[tone].pitch,tone,before:JSON.stringify(score.value),moved:false,unit:score.value.view==='staff'?6:12};canvas.value?.setPointerCapture(event.pointerId)}
  } else {
    selected.value=[]
    const layout=layoutScore(score.value)
    const stave=[...layout.staves].sort((a,b)=>Math.abs(a.y+20-y)-Math.abs(b.y+20-y))[0]
    switchVoice(stave.voice)
    const positions=layout.positions.filter(pos=>pos.voice===stave.voice)
    const next=positions.find(pos=>pos.row>stave.row||(pos.row===stave.row&&pos.x>x))
    caret.value=next?activeNotes.value.findIndex(note=>note.id===next.note.id):activeNotes.value.length
  }
}
function pointermove(event: PointerEvent) {
  if(!drag)return
  const distance=point(event).y-drag.startY
  if(Math.abs(distance)<4&&!drag.moved)return
  drag.moved=true
  const note=score.value.notes.find(n=>n.id===drag!.id)
  if(note) {
    const pitch=Math.max(-14,Math.min(28,drag.pitch-Math.round(distance/drag.unit)))
    try { Object.assign(note,updateTone(note,drag.tone,{pitch})) } catch { /* Do not merge two pitches during a drag. */ }
  }
}
function pointerup() {if(drag){if(drag.moved)save(drag.before);drag=undefined}}
function doubleclick(event: MouseEvent) {
  if((event.target as Element).closest('[data-note-id]'))return
  const {y}=point(event),layout=layoutScore(score.value)
  const stave=[...layout.staves].filter(stave=>stave.voice===activeVoice.value).sort((a,b)=>Math.abs(a.y+20-y)-Math.abs(b.y+20-y))[0]
  const value=score.value.view==='staff'?Math.max(-14,Math.min(28,Math.round((stave.y+60-y)/6))):keyTonic(score.value.key)
  insert(newNote(value,duration.value))
}
function setMeta(field: 'title'|'key'|'beats'|'beatUnit'|'tempo',event: Event) {
  const value=(event.target as HTMLInputElement).value
  edit(()=>{
    if(field==='title'||field==='key')score.value[field]=value
    else score.value[field]=Math.round(Math.max(field==='tempo'?30:1,Math.min(field==='tempo'?240:field==='beats'?12:16,Number(value)||4)))
  })
}
async function play() {
  stop()
  if(!noteCount.value)return
  const playback=scorePlayback(score.value,auditionMode.value==='current'?activeVoice.value:undefined)
  if(!playback.events.length){message.value='所选声部没有可试听的音符，或已设为静音。';return}
  const revision = playbackRevision
  const context = new AudioContext()
  sound = context
  try { await context.resume() } catch { if (revision === playbackRevision) { stop(); message.value='当前设备无法试听，请检查音频输出。' }; return }
  if (revision !== playbackRevision) return
  playing.value=true
  const startTime=context.currentTime+.05
  const beatSeconds=60/score.value.tempo
  const voiceGain=Math.sqrt(auditionMode.value==='current'?1:voices.value.filter(voice=>!voice.muted).length)
  for (const event of playback.events) {
    const time=startTime+event.start*beatSeconds, seconds=event.beats*beatSeconds
    for (const midi of event.midi) {
      const oscillator=context.createOscillator(),gain=context.createGain()
      oscillator.type='triangle';oscillator.frequency.value=440*2**((midi-69)/12)
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.12/(Math.sqrt(event.midi.length)*voiceGain),time+.015);gain.gain.exponentialRampToValueAtTime(.001,time+Math.max(.03,seconds*.9))
      oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+seconds)
    }
  }
  playbackTimer=setTimeout(stop,Math.max(0,(startTime+playback.beats*beatSeconds-context.currentTime)*1000))
}
function stop(){playbackRevision++;if(playbackTimer)clearTimeout(playbackTimer);if(sound){void sound.close();sound=undefined}playing.value=false}
function applySource(){try{const parsed=parseScore(sourceText.value);edit(()=>{score.value=parsed;syncVoice();caret.value=activeNotes.value.length});sourceVisible.value=false;message.value='源稿已应用'}catch{message.value='源稿无效，请检查 JSON 结构和音符数据。'}}
function exportImage(){stop();if(!noteCount.value){message.value='请先录入音符或休止符。';return}emit('export',renderScore(score.value))}
onUnmounted(stop)
</script>

<template>
  <div class="score-backdrop" @click.self="emit('close')">
    <section class="score-editor" role="dialog" aria-modal="true" aria-labelledby="score-editor-title" @keydown.stop="keydown">
      <header class="score-header"><div><h2 id="score-editor-title">乐谱编辑器</h2><span>在谱面上选择与编辑 · Shift 连选 · 双击空白处插入</span></div><button type="button" class="score-close" aria-label="关闭乐谱编辑器" @click="emit('close')">×</button></header>
      <div class="score-commandbar">
        <div class="score-segment"><button type="button" :class="{active:score.view==='jianpu'}" @click="edit(()=>score.view='jianpu')">简谱</button><button type="button" :class="{active:score.view==='staff'}" @click="edit(()=>score.view='staff')">五线谱</button></div>
        <select v-model="mode" aria-label="录入方式"><option value="insert">插入音符</option><option value="replace">替换所选音符</option><option value="chord">叠加和弦音</option></select>
        <div class="score-toolgroup"><button type="button" title="撤销 ⌘/Ctrl Z" aria-label="撤销" :disabled="!history.length" @click="undo">↶</button><button type="button" title="重做 ⌘/Ctrl Shift Z" aria-label="重做" :disabled="!future.length" @click="redo">↷</button></div>
        <div class="score-toolgroup"><button type="button" @click="selectAll">全选</button><button type="button" :disabled="!selected.length" @click="copy()">复制</button><button type="button" :disabled="!selected.length" @click="copy(true)">剪切</button><button type="button" :disabled="!copied.length" @click="paste">粘贴</button><button type="button" :disabled="!selected.length" @click="deleteSelection()">删除</button></div>
        <button type="button" class="score-play" :disabled="!noteCount" @click="playing?stop():play()">{{ playing?'■ 停止':'▶ 试听' }}</button>
      </div>
      <div class="score-palette" aria-label="乐谱工具面板">
        <div class="score-toolrow"><span class="score-rowlabel">音高</span><div class="score-toolgroup"><button v-for="degree in [1,2,3,4,5,6,7,0]" :key="degree" type="button" :title="degree?`录入 ${degree} / ${'CDEFGAB'[degree-1]}`:'休止符 0'" @click="pitch(degree)">{{ degree }}</button></div><div class="score-toolgroup"><button type="button" title="升高一音级 ↑" @click="transpose(1)">↑</button><button type="button" title="降低一音级 ↓" @click="transpose(-1)">↓</button><button type="button" title="升高八度 Shift ↑" @click="transpose(7)">8↑</button><button type="button" title="降低八度 Shift ↓" @click="transpose(-7)">8↓</button></div><div class="score-toolgroup"><button v-for="(glyph,accidentalKey) in {'#':'♯',b:'♭',n:'♮'}" :key="accidentalKey" type="button" :title="glyph" @click="accidental(accidentalKey as ScoreNote['accidental'])">{{ glyph }}</button><button type="button" title="清除临时升降号" @click="accidental('')">原音</button></div></div>
        <div class="score-toolrow"><span class="score-rowlabel">时值</span><div class="score-toolgroup"><button v-for="(value,index) in durations" :key="value" type="button" :class="{active:duration===value}" :aria-label="`${value}分音符`" :title="`${value}分音符`" @click="setDuration(value)"><span>{{ ['𝅝','𝅗𝅥','♩','♪','𝅘𝅥𝅯','𝅘𝅥𝅰','𝅘𝅥𝅱'][index] }}</span><small>{{ value }}</small></button></div><div class="score-toolgroup"><button type="button" title="附点 / 复附点" @click="modify({dots:((current?.dots||0)+1)%3})">附点 ·</button><button type="button" title="清除附点" @click="modify({dots:0})">无附点</button><button type="button" title="选中三个音符后设置三连音" @click="group('tuplet')">⌜3⌝</button><button type="button" title="连音线，Shift 选择多个音符" @click="group('slur')">⌒</button><button type="button" aria-label="延音线" title="选择相邻同音音符，连接或取消延音线" @click="tieSelection">延音 ⌢</button></div></div>
        <div class="score-toolrow"><span class="score-rowlabel">记号</span><div class="score-toolgroup"><button type="button" title="单小节线" @click="addBar('single')">│</button><button type="button" title="双小节线" @click="addBar('double')">Ⅱ</button><button type="button" title="终止线" @click="addBar('end')">▕▏</button><button type="button" title="左反复" @click="addBar('repeatStart')">‖:</button><button type="button" title="右反复" @click="addBar('repeatEnd')">:‖</button><button type="button" title="换行 Enter" @click="insert(newNote(0,4,'break'))">↵</button></div><div class="score-toolgroup"><button v-for="mark in ['p','mp','mf','f','ff','rit.','accel.','>','•','𝄐']" :key="mark" type="button" :title="`添加 ${mark}`" @click="modify({mark})">{{ mark }}</button><button type="button" title="清除所选音符的表情记号与连线" @click="clearMarks">清除记号</button></div></div>
      </div>
      <div class="score-voices" aria-label="声部管理">
        <span>声部</span><div class="score-segment"><button v-for="voice in voices" :key="voice.id" type="button" :class="{active:voice.id===activeVoice}" :aria-pressed="voice.id===activeVoice" :aria-label="`编辑${voice.name}`" @click="switchVoice(voice.id,true)">{{ voice.name }}{{ voice.muted?' · 静音':'' }}</button></div>
        <button type="button" :disabled="voices.length>=4" @click="addVoice">＋ 声部</button>
        <input aria-label="当前声部名称" :value="voices.find(voice=>voice.id===activeVoice)?.name" maxlength="32" @change="renameVoice"/>
        <button type="button" :aria-pressed="!!voices.find(voice=>voice.id===activeVoice)?.muted" @click="muteVoice">当前声部静音</button><button type="button" :disabled="voices.length===1" @click="removeVoice">移除声部</button>
        <label>试听<select v-model="auditionMode" aria-label="试听声部范围" @change="stop"><option value="all">全部声部合奏</option><option value="current">仅当前声部</option></select></label>
      </div>
      <div class="score-metadata"><input aria-label="乐谱标题" :value="score.title" placeholder="未命名乐谱（点击填写标题）" @change="setMeta('title',$event)"/><label>调号<select :value="score.key" @change="setMeta('key',$event)"><option v-for="key in ['C','G','D','A','E','F','Bb','Eb']" :key="key">{{ key }}</option></select></label><label>拍号<input aria-label="每小节拍数" type="number" min="1" max="12" :value="score.beats" @change="setMeta('beats',$event)"/>/<select aria-label="拍号分母" :value="score.beatUnit" @change="setMeta('beatUnit',$event)"><option v-for="value in [2,4,8,16]" :key="value">{{ value }}</option></select></label><label>♩ = <input aria-label="速度" type="number" min="30" max="240" :value="score.tempo" @change="setMeta('tempo',$event)"/></label></div>
      <div v-if="noteCount" class="score-measure-status" :class="{warning:measureIssues.length}" role="status">自动小节线 · {{ measureSummary }}<span v-if="measureIssues.length">（弱起或片段可保留不完整小节；跨小节音符请拆分并添加延音线）</span></div>
      <div class="score-workspace"><div ref="canvas" class="score-paper" tabindex="0" role="application" aria-label="可编辑乐谱，数字键录入，方向键调整音高，Shift 点击连选，Delete 删除" :style="{width:`${zoom}%`}" @pointerdown="pointerdown" @pointermove="pointermove" @pointerup="pointerup" @pointercancel="pointerup" @dblclick="doubleclick" v-html="svg"></div></div>
      <div v-if="currentTones.length>1 && selected.length===1" class="score-chord-inspector" aria-label="和弦音编辑">
        <span>和弦音</span><button v-for="(tone,index) in currentTones" :key="index" type="button" :class="{active:toneIndex===index}" :aria-pressed="toneIndex===index" :aria-label="`选择和弦音 ${noteName(tone.pitch)}`" @click="toneSelection={id:current!.id,index}">{{ noteName(tone.pitch) }}{{ {'#':'♯',b:'♭',n:'♮','':''}[tone.accidental] }}</button>
        <button type="button" aria-label="所选和弦音升高一音级" @click="changeTone({pitch:currentTones[toneIndex].pitch+1})">↑</button><button type="button" aria-label="所选和弦音降低一音级" @click="changeTone({pitch:currentTones[toneIndex].pitch-1})">↓</button><button type="button" @click="deleteTone">移除此和弦音</button><small>拖动音头可单独改变音高；上方面板的升降号作用于所选和弦音。</small>
      </div>
      <div v-if="current" class="score-inspector"><strong>{{ selected.length>1?`已选 ${selected.length} 个元素`:current.kind==='note'?(currentTones.length>1?`和弦 · ${currentTones.length} 音`:noteName(current.pitch)):current.kind==='rest'?'休止符':'小节 / 换行' }}</strong><label>歌词<input aria-label="所选音符歌词" :value="current.lyric" placeholder="为所选音符填写歌词" @change="modify({lyric:($event.target as HTMLInputElement).value})"/></label><span>光标 {{ caret }} / {{ activeNotes.length }}</span><button type="button" @click="selected=[]">取消选择</button></div>
      <div v-if="sourceVisible" class="score-source"><textarea v-model="sourceText" aria-label="乐谱源稿 JSON" spellcheck="false"></textarea><button type="button" @click="applySource">应用源稿</button><button type="button" @click="sourceVisible=false">收起</button></div>
      <footer class="score-footer"><span role="status">{{ message || `${noteCount} 个音符 · 源稿随题目保存` }}</span><button type="button" @click="sourceVisible=!sourceVisible;sourceText=JSON.stringify(score,null,2)">源稿</button><label>缩放<select v-model.number="zoom" aria-label="乐谱缩放"><option :value="75">75%</option><option :value="100">100%</option><option :value="125">125%</option><option :value="150">150%</option></select></label><button type="button" @click="emit('close')">返回题目</button><button type="button" class="score-export" :disabled="busy||!noteCount" @click="exportImage">{{ busy?'正在生成…':'生成题目图片' }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
.score-measure-status{padding:7px 18px;background:#f3f8f5;color:#397254;font-size:11px;line-height:1.6;max-height:70px;overflow:auto}.score-measure-status.warning{background:#fff8eb;color:#95661e}.score-measure-status span{margin-left:8px}

.score-voices{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 18px;background:#fff;border-bottom:1px solid #e5e9f0}.score-voices>span{font-size:10px;color:#7f899a}.score-voices>input{width:104px}.score-voices label{display:flex;align-items:center;gap:6px;margin-left:auto;color:#7f899a}.score-voices .score-segment{max-width:440px;overflow:auto}.score-voices .score-segment button{max-width:130px;overflow:hidden;text-overflow:ellipsis}
.score-chord-inspector{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:7px 18px;border-top:1px solid #dfe5f1;background:#f8faff}.score-chord-inspector>span{margin-right:8px;color:#6b7890}.score-chord-inspector small{margin-left:8px;color:#8791a3}.score-chord-inspector button{background:#edf0f7}
.score-backdrop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(23,29,40,.32);backdrop-filter:blur(10px)}
.score-editor{display:flex;flex-direction:column;width:min(1380px,100%);height:calc(100dvh - 36px);max-height:1100px;overflow:hidden;border:1px solid #dfe3ea;border-radius:16px;background:#f6f7f9;box-shadow:0 24px 90px #18253c3d;color:#333b49;font-size:12px}
.score-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#fff;border-bottom:1px solid #e6e9ef}.score-header h2{margin:0 0 4px;font-size:17px}.score-header span{color:#939ba7;font-size:11px}.score-close{font-size:25px;width:32px;height:32px;border-radius:7px;background:#f2f4f7}
.score-editor button{flex-shrink:0;min-width:32px;height:30px;padding:0 9px;border:1px solid transparent;border-radius:5px;color:inherit;font-size:12px;white-space:nowrap}.score-editor button:hover{background:#e9edf4}.score-editor button:active{background:#dce6ff}.score-editor button:focus-visible{outline:2px solid #7396f3;outline-offset:1px}.score-editor button:disabled{opacity:.35;cursor:default}.score-editor button.active{color:#2e60dc;background:#e9efff;border-color:#bccdf8}
.score-commandbar,.score-toolrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.score-commandbar{padding:8px 16px;border-bottom:1px solid #e1e5ed;background:#fdfdfe}.score-commandbar>.score-play{margin-left:auto;color:#3d68c7}.score-segment{display:flex;padding:2px;background:#edf0f5;border-radius:7px}.score-toolgroup{display:flex;align-items:center;gap:3px;padding-right:10px;border-right:1px solid #dfe3eb}.score-toolgroup:last-child{border-right:0}.score-toolgroup button{display:flex;align-items:center;justify-content:center;gap:4px;background:#eef0f4}.score-toolgroup button span{font-size:19px;line-height:1;font-family:'Apple Symbols','Segoe UI Symbol',serif}.score-toolgroup button small{font-size:9px;color:#7f8897}
.score-palette{padding:8px 16px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid #e1e5ed;background:#fafbfc}.score-rowlabel{font-size:10px;color:#8b94a3;width:28px;flex-shrink:0}.score-metadata{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:9px 18px;border-bottom:1px solid #e1e5ed;background:#fff}.score-metadata>input{flex:1;min-width:180px;max-width:440px}.score-metadata label,.score-footer label{display:flex;align-items:center;gap:5px;color:#828b99}.score-editor input,.score-editor select{height:28px;max-width:100%;padding:3px 7px;border:1px solid #dfe3eb;border-radius:5px;background:#fff;color:#465166;font-size:11px}.score-metadata input[type=number]{width:52px}.score-workspace{flex:1;min-height:130px;overflow:auto;padding:24px;background:#e9ecf1}.score-paper{position:relative;min-width:650px;margin:0 auto;background:#fff;box-shadow:0 3px 16px #202d4714;outline:none;touch-action:none}.score-paper:focus-visible{outline:2px solid #b3c6f5}.score-paper :deep(svg){display:block;width:100%;height:auto;user-select:none}.score-paper :deep([data-note-id]){cursor:grab}.score-paper :deep([data-note-id]:hover rect){stroke:#9eb7ed}.score-inspector{display:flex;align-items:center;gap:16px;padding:8px 18px;background:#f8faff;border-top:1px solid #dfe5f1}.score-inspector strong{min-width:72px;font-size:11px;color:#4d6ba8}.score-inspector label{display:flex;gap:8px;align-items:center;flex:1}.score-inspector input{width:100%;max-width:420px}.score-inspector>span{color:#9aa2af;font-size:10px}.score-source{display:flex;align-items:flex-start;gap:10px;padding:12px;background:#fff;border-top:1px solid #e5e8ee}.score-source textarea{flex:1;height:160px;resize:vertical;border:1px solid #dfe4ed;border-radius:5px;font:11px monospace;padding:10px}.score-footer{display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 16px;border-top:1px solid #e0e5ed;background:#fff}.score-footer>span{flex:1;font-size:11px;color:#8a93a2}.score-footer .score-export{background:#3b6df6;color:#fff;padding:0 16px}.score-footer .score-export:hover{background:#2f5fdc}
@media(max-width:1000px){.score-toolrow{gap:6px}.score-editor button{padding:0 7px}.score-palette{max-height:190px;overflow:auto}.score-workspace{padding:15px}.score-header span{font-size:10px}.score-footer{flex-wrap:wrap}.score-inspector{gap:8px}}
@media(prefers-reduced-transparency:reduce){.score-backdrop{backdrop-filter:none;background:#333b4970}}
</style>
