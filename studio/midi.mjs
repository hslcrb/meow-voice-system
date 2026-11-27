import {validateScore} from './core.mjs';

const LIMIT = 2_000_000;
const invalid = reason => Error('MIDI: '+reason);

function trackEvents(bytes, start, end) {
  let cursor=start, tick=0, running, ended=false;
  const notes=[], tempos=[], active=new Map();
  const take=()=>{if(cursor>=end)throw invalid('트랙이 잘렸어요.');return bytes[cursor++];};
  const vlq=()=>{
    let value=0;
    for(let i=0;i<4;i++){const b=take();value=value*128+(b&127);if(b<128)return value;}
    throw invalid('길이 값이 너무 커요.');
  };
  const skip=n=>{if(cursor+n>end)throw invalid('이벤트 길이가 트랙을 초과해요.');cursor+=n;};
  while(cursor<end) {
    tick+=vlq();
    if(tick>1_000_000_000)throw invalid('지원하는 시간 범위를 넘었어요.');
    let status=take();
    if(status<128) {
      if(running===undefined)throw invalid('유효한 러닝 상태가 없어요.');
      status=running;cursor--;
    }
    if(status===0xff) {
      running=undefined;
      const type=take(),len=vlq();
      if(type===0x2f){
        if(len!==0||cursor!==end)throw invalid('트랙 종료 이벤트가 마지막에 있어야 해요.');
        ended=true;break;
      }
      if(type===0x51){
        if(len!==3)throw invalid('템포 길이가 잘못됐어요.');
        const tempo=(take()<<16)|(take()<<8)|take();
        if(!tempo)throw invalid('0 템포는 지원하지 않아요.');
        tempos.push({tick,tempo});
        if(tempos.length>10000)throw invalid('템포 이벤트가 너무 많아요.');
      }else skip(len);
      continue;
    }
    if(status===0xf0||status===0xf7){running=undefined;skip(vlq());continue;}
    if(status>=0xf0)throw invalid('지원하지 않는 시스템 이벤트예요.');
    running=status;
    const kind=status>>4, channel=status&15;
    const p=take(),v=kind===12||kind===13?0:take();
    if(p>=128||v>=128)throw invalid('채널 메시지 데이터가 잘못됐어요.');
    if(kind!==8&&kind!==9)continue;
    const key=channel*128+p;
    if(kind===9&&v){
      if(active.has(key))throw invalid('같은 채널의 같은 음이 겹쳐요.');
      active.set(key,{tick,midi:p,velocity:v/127,channel});
    } else {
      const note=active.get(key);
      if(!note||tick<=note.tick)throw invalid('짝이 없거나 길이가 없는 음표예요.');
      active.delete(key);
      notes.push({...note,endTick:tick});
      if(notes.length>10000)throw invalid('트랙 음표가 너무 많아요.');
    }
  }
  if(!ended||active.size)throw invalid('트랙 또는 음표 종료가 없어요.');
  return {notes,tempos};
}

function tempoMap(tempos, ppq) {
  let tick0=0, seconds=0, rate=500000/(ppq*1e6);
  const map=[{tick:0,seconds,rate}];
  for(const {tick,tempo} of tempos){
    seconds+=(tick-tick0)*rate;
    tick0=tick;rate=tempo/(ppq*1e6);
    map.push({tick,seconds,rate});
  }
  return tick=>{
    let low=0, high=map.length;
    while(low+1<high){const mid=(low+high)>>>1;if(map[mid].tick<=tick)low=mid;else high=mid;}
    const p=map[low];return p.seconds+(tick-p.tick)*p.rate;
  };
}

export function parseMidi(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<14||bytes.length>LIMIT)throw invalid('2 MB 이하의 표준 MIDI 파일을 넣어 주세요.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(v.getUint32(0)!==0x4d546864||v.getUint32(4)!==6)throw invalid('표준 MThd 헤더가 없어요.');
  const format=v.getUint16(8),count=v.getUint16(10),ppq=v.getUint16(12);
  if(![0,1].includes(format)||!count||count>64||(format===0&&count!==1))throw invalid('표준 MIDI 형식 0·1과 최대 64트랙만 지원해요.');
  if(!ppq||ppq>=32768)throw invalid('SMPTE 시간 분할은 지원하지 않아요. PPQ로 내보내세요.');
  let offset=14;
  const tracks=[];
  for(let i=0;i<count;i++){
    if(offset+8>bytes.length||v.getUint32(offset)!==0x4d54726b)throw invalid('MTrk 트랙을 찾을 수 없어요.');
    const start=offset+8,end=start+v.getUint32(offset+4);
    if(end>bytes.length)throw invalid('트랙 데이터가 잘렸어요.');
    tracks.push(trackEvents(bytes,start,end));
    offset=end;
  }
  if(offset!==bytes.length)throw invalid('트랙 뒤에 알 수 없는 데이터가 있어요.');
  if(format===1&&tracks.slice(1).some(t=>t.tempos.length))throw invalid('형식 1 템포는 트랙 0에 있어야 해요.');
  const toSeconds=tempoMap(tracks[0].tempos,ppq);
  return {format,ppq,tracks:tracks.map(({notes})=>({notes:notes.sort((a,b)=>a.tick-b.tick||a.channel-b.channel||a.midi-b.midi).map(n=>{
    const start=toSeconds(n.tick),duration=toSeconds(n.endTick)-start;
    return {start,duration,midi:n.midi,velocity:n.velocity};
  })}))};
}

export function scoreFromMidi(bytes, track, lyrics, options={}) {
  const notes=Number.isInteger(track)?parseMidi(bytes).tracks[track]?.notes:undefined;
  if(!notes?.length)throw invalid('음표가 들어 있는 트랙 번호를 골라 주세요.');
  if(!Array.isArray(lyrics)||lyrics.length!==notes.length)throw invalid('음표와 가사 항목 개수가 같아야 해요.');
  return validateScore({version:1,voice:'hybrid',...options,notes:notes.map((n,i)=>({...n,lyric:lyrics[i]}))});
}
