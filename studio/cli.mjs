import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditLrc, decodeWav, encodeWav, parseLrc, renderScore, validateScore} from './core.mjs';
import {parseMidi,scoreFromMidi} from './midi.mjs';

const help=`먀용 스튜디오
  node studio/cli.mjs validate <score.json>
  node studio/cli.mjs render <score.json> --out <mix.wav> [--backing <pcm16.wav>] [--vocal <stem.wav>]
  node studio/cli.mjs show <score.json> --out <stage.html> [--backing <pcm16.wav>]
  node studio/cli.mjs lrc <lyrics.lrc>
  node studio/cli.mjs lrc-audit <score.json> --lyrics <lyrics.lrc> [--tolerance-ms N]
  node studio/cli.mjs midi-list <melody.mid>
  node studio/cli.mjs midi-import <melody.mid> --track N --lyrics <syllables.json> --out <score.json>
  node studio/cli.mjs provider-check <곡 검색어>`;
const readBounded=async(path,max)=>{
  const info=await stat(path);
  if(!info.isFile()||info.size>max) throw Error('파일 종류 또는 크기를 확인해 주세요: '+path);
  return readFile(path);
};
const getWav=async(path)=>path?decodeWav(await readBounded(path,231_000_000)):undefined;
const outputFile=async(path,bytes)=>writeFile(path,bytes,{flag:'wx'});
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function stageHtml(score,data) {
  const duration=data.mix.length/data.sampleRate;
  const audio=Buffer.from(encodeWav(data.mix,data.sampleRate)).toString('base64');
  const titles={cat:'고양이', human:'사람',hybrid:'하이브리드'};
  const rows=score.notes.map(n=>`<li data-start="${n.start}" data-until="${n.start+n.duration}"><span>${n.start.toFixed(2)}초</span><strong>${esc(n.lyric)}</strong><span>MIDI ${n.midi}</span></li>`).join('');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(score.title)} · 먀용 무대</title>
<style>
:root{color-scheme:light;font-family:system-ui,sans-serif;background:#17101d;color:#2b1324}
body{margin:0;padding:clamp(1rem,5vw,4rem);background:repeating-linear-gradient(130deg,#201427 0 12px,#27172b 12px 24px);min-height:100vh;box-sizing:border-box}
main{background:#fff4fc;border:3px solid #2b1324;box-shadow:8px 8px #ff79c4;border-radius:2rem;max-width:45rem;margin:auto;padding:clamp(1rem,4vw,2.7rem)}
p{font-weight:750}h1{font-size:clamp(2rem,6vw,3.7rem);line-height:1.08;overflow-wrap:anywhere}
code{padding:.3rem .7rem;background:#fec7e6;border-radius:999px}audio{width:100%}ol{padding:0;display:grid;gap:.45rem;list-style:none}li{display:grid;grid-template-columns:6rem 1fr 5rem;gap:.4rem;border-bottom:1px dashed #604459;padding:.55rem .3rem}li.active{background:#fbd1ff;border-color:#291a2d;outline:2px solid #9b287e;border-radius:.35rem}strong{overflow-wrap:anywhere}
</style><main><p><code>MVS ★ OFFLINE SHOW</code></p><h1>${esc(score.title)}</h1><p>${titles[score.voice]} 합성 · ${duration.toFixed(2)}초 · ${data.sampleRate.toLocaleString('ko-KR')} Hz</p>
<audio controls preload="metadata" src="data:audio/wav;base64,${audio}"></audio><p>☆ 가사·음정 타임라인</p><ol>${rows}</ol></main>
<script>const a=document.querySelector('audio'), rows=[...document.querySelectorAll('li')];function tick(){for(const r of rows){const lit=a.currentTime>=+r.dataset.start&&a.currentTime<+r.dataset.until;r.classList.toggle('active',lit);if(lit)r.setAttribute('aria-current','true');else r.removeAttribute('aria-current');}}for(const event of ['timeupdate','seeked','ended'])a.addEventListener(event,tick);tick();</script></html>\n`;
}
export async function providerCandidates(query,fetcher=fetch) {
  if(!query?.trim()||query.length>120) throw Error('곡 검색어는 1~120자로 입력해 주세요.');
  const url=new URL('https://lrclib.net/api/v2/search');url.searchParams.set('track_name',query.trim());
  const res=await fetcher(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'MVS/0.1 (https://github.com/hslcrb/meow-voice-system)'}});
  if(!res.ok) throw Error('LRCLIB 메타데이터 요청 실패: HTTP '+res.status);
  const data=await res.json();
  if(!Array.isArray(data)) throw Error('지원하지 않는 LRCLIB 메타데이터 응답입니다.');
  if(data.some(x=>x&&['plainLyrics','syncedLyrics','lyricsfile'].some(k=>Object.hasOwn(x,k)))) throw Error('본문 없는 메타데이터 전용 응답이 아니므로 처리하지 않습니다.');
  return data.slice(0,20).map(x=>({id:x.id,title:x.track_name??x.trackName??x.name,artist:x.artist_name??x.artistName,album:x.album_name??x.albumName,duration:x.duration,
    hasSyncedLyrics:x.has_synced_lyrics??x.hasSyncedLyrics??x.has_synced}));
}
async function main(args) {
  if(!args.length||args[0]==='--help'){console.log(help);return;}
  const [op,input,...tail]=args;
  if(!['validate','render','show','lrc','lrc-audit','provider-check','midi-list','midi-import'].includes(op)||!input) throw Error(help);
  const options={};
  const allowed=op==='render'?['--out','--backing','--vocal']:op==='show'?['--out','--backing']:op==='midi-import'?['--track','--lyrics','--out']:op==='lrc-audit'?['--lyrics','--tolerance-ms']:[];
  for(let i=0;i<tail.length;i+=2){
    const k=tail[i],v=tail[i+1];
    if(!allowed.includes(k)||!v||v.startsWith('--')||Object.hasOwn(options,k)) throw Error('지원하지 않거나 값이 없는 옵션: '+k);
    options[k]=v;
  }
  if(op==='midi-list'){
    const {format,ppq,tracks}=parseMidi(await readBounded(input,2_000_000));
    console.log(JSON.stringify({format,ppq,tracks:tracks.map((t,number)=>({number,notes:t.notes.length}))}));
    return;
  }
  if(op==='midi-import'){
    const track=options['--track'],lyrics=options['--lyrics'],out=options['--out'];
    if(!/^(0|[1-9][0-9]?)$/.test(track??'')||!lyrics||!out?.toLowerCase().endsWith('.json')) throw Error('MIDI 가져오기는 --track N, --lyrics JSON, --out JSON이 필요합니다.');
    const parts=JSON.parse((await readBounded(lyrics,2_000_000)).toString('utf8'));
    const result=scoreFromMidi(await readBounded(input,2_000_000),Number(track),parts);
    await outputFile(out,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({out,track:Number(track),notes:result.notes.length}));
    return;
  }
  if(op==='lrc'){console.log(JSON.stringify(parseLrc((await readBounded(input,1_600_000)).toString('utf8')),null,2));return;}
  if(op==='lrc-audit'){
    const lyrics=options['--lyrics'], ms=options['--tolerance-ms'];
    if(!lyrics||(ms!==undefined&&!/^\d{1,4}$/.test(ms))) throw Error('LRC 검수는 --lyrics와 선택적 --tolerance-ms 정수를 받습니다.');
    const raw=JSON.parse((await readBounded(input,2_000_000)).toString('utf8'));
    const text=(await readBounded(lyrics,1_600_000)).toString('utf8');
    console.log(JSON.stringify(auditLrc(raw,text,ms===undefined?{}:{toleranceMs:Number(ms)}),null,2));
    return;
  }
  if(op==='provider-check'){console.log(JSON.stringify(await providerCandidates(input),null,2));return;}
  const score=validateScore(JSON.parse((await readBounded(input,2_000_000)).toString('utf8')));
  if(op==='validate'){console.log(JSON.stringify({title:score.title,voice:score.voice,call:score.call,sampleRate:score.sampleRate,end:score.end,articulation:score.articulation,notes:score.notes.length}));return;}
  const out=options['--out'],stem=options['--vocal'];
  if(!out?.toLowerCase().endsWith(op==='show'?'.html':'.wav')||(stem&&(!stem.toLowerCase().endsWith('.wav')||resolve(stem)===resolve(out)))) throw Error('서로 다른 유효한 출력 파일 경로를 지정해 주세요.');
  const data=renderScore(score,{backing:await getWav(options['--backing'])});
  await outputFile(out,op==='show'?stageHtml(score,data):encodeWav(data.mix,data.sampleRate));
  if(stem) await outputFile(stem,encodeWav(data.vocal,data.sampleRate));
  console.log(JSON.stringify({out,stem,seconds:data.mix.length/data.sampleRate,sampleRate:data.sampleRate}));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) main(process.argv.slice(2)).catch(e=>{ console.error(e.message);process.exitCode=2; });
