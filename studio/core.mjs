export const MAX_SECONDS = 300;
const RATES = new Set([16000, 22050, 24000, 32000, 44100, 48000, 96000]);
const VOICES = new Set(['cat','human','hybrid']);
const CALLS = new Set(['meow','purr','hiss','growl','chirp']);
const TAU = 2*Math.PI;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo,x));
function isNumber(x,lo,hi) { return typeof x === 'number' && Number.isFinite(x) && x>=lo && x<=hi; }
export function validateScore(raw) {
  if (!raw || raw.version!==1 || !VOICES.has(raw.voice)) throw Error('악보 버전은 1, 보컬은 cat·human·hybrid 중 하나여야 해요.');
  const sampleRate=raw.sampleRate??44100,call=raw.call??'meow';
  if (!RATES.has(sampleRate) || !CALLS.has(call)) throw Error('지원하지 않는 샘플률 또는 발성 프리셋입니다.');
  if (raw.voice!=='cat' && call!=='meow') throw Error('특수 호출은 고양이 보컬에서만 선택할 수 있어요.');
  if (!Array.isArray(raw.notes)||!raw.notes.length||raw.notes.length>5000) throw Error('음표는 1개 이상, 5,000개 이하로 넣어 주세요.');
  let previousEnd=0;
  const notes=raw.notes.map((note,i)=>{
    const {start,duration,midi,lyric,velocity=0.8}=note??{};
    if (!isNumber(start,0,MAX_SECONDS)||!isNumber(duration,.02,MAX_SECONDS)||
      start+duration>MAX_SECONDS+1e-8 || start+1e-8<previousEnd ||
      !Number.isInteger(midi)||!isNumber(midi,0,127)||typeof lyric!=='string'||!lyric.trim()||
      [...lyric].length>32||!isNumber(velocity,0,1)) throw Error(`${i+1}번 음표: 음정·가사·시각을 확인해 주세요. 음표를 겹치거나 5분을 넘길 수 없어요.`);
    previousEnd=start+duration;
    return {start,duration,midi,lyric:lyric.trim(),velocity};
  });
  return {version:1,title:typeof raw.title==='string'?raw.title.trim().slice(0,120)||'먀용 스튜디오':'먀용 스튜디오',voice:raw.voice,call,sampleRate,notes};
}

export function parseLrc(text) {
  if(typeof text!=='string'||text.length>400000) throw Error('LRC 텍스트가 너무 큽니다.');
  const offset=Number(/^\s*\[offset:([+-]?\d+)\]/im.exec(text)?.[1]??0)/1000;
  const entries=[];
  for(const line of text.split(/\r?\n/)) {
    const stamps=[...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    if(!stamps.length) continue;
    const lyric=line.slice(stamps.at(-1).index+stamps.at(-1)[0].length).trim();
    if(!lyric) continue;
    for(const x of stamps) entries.push({start:Math.max(0,Math.round((60*Number(x[1])+Number(x[2])+Number('0.'+(x[3]??0))+offset)*1000)/1000),lyric});
  }
  if(!entries.length) throw Error('시간표가 들어 있는 가사 줄을 찾지 못했어요.');
  return entries.sort((a,b)=>a.start-b.start);
}

// Rounded synthesis targets, not measurements of cat tissue or vocal tract.
const FORMANTS={a:[760,1320,2560],e:[480,2050,2750],i:[320,2290,3030],o:[470,900,2430],u:[360,840,2280],eo:[550,1120,2530],eu:[440,1430,2480]};
const JUNG=['a','e','a','e','eo','e','eo','e','o','a','e','e','o','u','eo','e','i','u','eu','i','i'];
function vowelOf(s) {
  const n=s.codePointAt(0)-0xAC00;
  if(n>=0&&n<11172) return FORMANTS[JUNG[Math.floor(n/28)%21]];
  return FORMANTS[/[aeiou]/i.exec(s)?.[0].toLowerCase()]??FORMANTS.a;
}
const noiseAt = i => ((Math.imul(i+12345,1597334677)^Math.imul(i+17,2246822519))>>>0)/2147483648-1;
const mix = (a,b,t) => a+(b-a)*t;

function noteInto(out,n,s,voice,call) {
  const from=Math.round(n.start*s), to=Math.min(out.length,Math.round((n.start+n.duration)*s)), len=to-from;
  const midiHz=440*2**((n.midi-69)/12);
  const feline=voice==='cat'?1:voice==='hybrid'?.48:0;
  // Compose Hangul for formant selection without changing the score's original lyric.
  const syllables=[...n.lyric.normalize('NFC').replace(/\s/g,'')].map(vowelOf);
  const harmonics=Array.from({length:9},(_,h)=>h < 2 ? 1 : 1/(h**(1.28-feline*.14)));
  // A deterministic source/filter bank: harmonic excitation and parallel vowel resonators.
  let phase=0,hissMean=0, prevNoise=0;
  const y1=[0,0,0],y2=[0,0,0],coeff=[0,0,0],amp=[0,0,0];
  const bw=[95,145,245],radius=bw.map(f=>Math.exp(-Math.PI*f/s));
  const gains=[.85,.48,.32];
  for(let j=0;j<len;j++) {
    const t=j/s,p=j/Math.max(1,len-1);
    const syllable=clamp(Math.floor(p*syllables.length),0,syllables.length-1);
    const form=syllables[syllable];
    const next=syllables[Math.min(syllable+1,syllables.length-1)];
    const transition=clamp((p*syllables.length-syllable-.75)*4,0,1);
    if(j%32===0) for(let k=0;k<3;k++){
      const target=clamp(mix(form[k],next[k],transition)*(1+feline*(.12+.14*Math.sin(Math.PI*p))),60,s*.46);
      coeff[k]=2*radius[k]*Math.cos(TAU*target/s);
      amp[k]=(1-radius[k])*gains[k];
    }
    const pitchMotion=feline*(.006*Math.sin(TAU*5*t)-.012*(1-p)**5);
    const fundamental=clamp(midiHz*(1+pitchMotion+(call==='chirp'?.12*Math.sin(TAU*11*t):0)),8,s*.45);
    phase=(phase+TAU*fundamental/s)%TAU;
    let pulse=Math.sin(phase);
    for(let h=2;h<=8&&h*fundamental<s*.47;h++) pulse+=Math.sin(h*phase)*harmonics[h];
    const noise=noiseAt(from+j);
    hissMean=.91*hissMean+.09*noise;
    let filtered=0;
    for(let k=0;k<3;k++){
      const y=amp[k]*pulse+coeff[k]*y1[k]-radius[k]**2*y2[k]; y2[k]=y1[k];y1[k]=y;filtered+=y;
    }
    const attack=clamp(t/.017,0,1),release=clamp((len-1-j)/s/.029,0,1);
    let x=.17*pulse+.63*filtered+(.018+.025*feline)*(noise-prevNoise);
    prevNoise=noise;
    if(call==='purr') x=.5*Math.sin(TAU*24*t)*(.6+.36*Math.sin(TAU*2*t))+.13*filtered;
    if(call==='hiss') x=.48*(noise-hissMean)*(.55+.45*Math.sin(Math.PI*p));
    if(call==='growl') x=x*(.68+.3*Math.sin(TAU*34*t))+.075*(noise-hissMean);
    if(call==='chirp') x*=.65+.35*Math.sin(TAU*9*t);
    out[from+j]=clamp(x*n.velocity*attack*release,-.94,.94);
  }
}
export function renderScore(raw,{backing}={}) {
  const score=validateScore(raw),s=score.sampleRate,last=score.notes.at(-1);
  if(backing&&(!Number.isInteger(backing.sampleRate)||backing.sampleRate<8000||backing.sampleRate>192000||
    !(backing.samples instanceof Float32Array)||backing.samples.length/backing.sampleRate>MAX_SECONDS)) throw Error('반주는 최대 5분의 PCM16 WAV만 지원해요.');
  const length=Math.max(Math.round((last.start+last.duration)*s),backing?Math.round(backing.samples.length*s/backing.sampleRate):0);
  const vocal=new Float32Array(length);
  for(const n of score.notes) noteInto(vocal,n,s,score.voice,score.call);
  const mixed=vocal.slice();
  if(backing) {
    const ratio=backing.sampleRate/s;
    for(let i=0;i<mixed.length;i++){
      const pos=i*ratio,j=Math.floor(pos);
      const x=backing.samples[j]??0,y=backing.samples[j+1]??x;
      mixed[i]=clamp(vocal[i]*.81+.62*mix(x,y,pos-j),-.99,.99);
    }
  }
  return {sampleRate:s,vocal,mix:mixed};
}
function fourcc(v,i) { return String.fromCharCode(v.getUint8(i),v.getUint8(i+1),v.getUint8(i+2),v.getUint8(i+3)); }
export function decodeWav(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const bad=()=>Error('PCM16 WAV 모노 또는 스테레오 파일이 필요합니다.');
  if(v.byteLength<44||fourcc(v,0)!=='RIFF'||fourcc(v,8)!=='WAVE') throw bad();
  const end=v.getUint32(4,true)+8;
  if(end>v.byteLength||end<44) throw bad();
  let fmt,data;
  for(let at=12;at+8<=end;){
    const id=fourcc(v,at),n=v.getUint32(at+4,true),p=at+8;
    if(p+n>end) throw bad();
    if(id==='fmt '&&n>=16) fmt={code:v.getUint16(p,true),ch:v.getUint16(p+2,true),rate:v.getUint32(p+4,true),align:v.getUint16(p+12,true),bits:v.getUint16(p+14,true)};
    if(id==='data'&&!data) data={p,n};
    at=p+n+(n%2);
  }
  if(!fmt||!data||fmt.code!==1||fmt.bits!==16||![1,2].includes(fmt.ch)||fmt.align!==fmt.ch*2||fmt.rate<8000||fmt.rate>192000||data.n%fmt.align||!data.n||data.n/fmt.align/fmt.rate>MAX_SECONDS) throw bad();
  const samples=new Float32Array(data.n/fmt.align);
  for(let i=0;i<samples.length;i++){
    const p=data.p+i*fmt.align,a=v.getInt16(p,true),b=fmt.ch===2?v.getInt16(p+2,true):a;
    samples[i]=(a+b)/65536;
  }
  return {sampleRate:fmt.rate,samples};
}
export function encodeWav(samples,sampleRate) {
  if (!RATES.has(sampleRate)||!(samples instanceof Float32Array)||samples.length>sampleRate*MAX_SECONDS) throw Error('지원하지 않는 WAV 출력입니다.');
  const bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);
  const tag=(i,s)=>{for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j));};
  tag(0,'RIFF');v.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);
  v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');
  v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) v.setInt16(44+i*2,Math.round(clamp(samples[i],-1,1)*(samples[i]<0?32768:32767)),true);
  return bytes;
}
