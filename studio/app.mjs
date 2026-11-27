import { validateScore, encodeWav, decodeWav, parseLrc } from './core.mjs';
import {parseMidi,scoreFromMidi} from './midi.mjs';

const $ = id => document.getElementById(id);
const fields = [
  { key: 'start', label: '시작 (초)', min: 0, step: 0.01 },
  { key: 'duration', label: '길이 (초)', min: 0.02, step: 0.01 },
  { key: 'midi', label: '음정 (MIDI)', min: 0, max: 127, step: 1 },
  { key: 'lyric', label: '가사' },
];
let current = { version: 1, sampleRate: 44100, notes: [] };
let urls = [];
let initialized = false;
const ko = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

function announce(message, error = false) {
  $('status').textContent = message;
  $('status').toggleAttribute('data-error', error);
}
function updateCount() {
  $('note-count').textContent = `${$('notes').children.length}개`;
  $('notes').querySelectorAll('.note').forEach((row, index) => {
    for (const input of row.querySelectorAll('input')) {
      const field = fields.find(({ key }) => key === input.name);
      input.setAttribute('aria-label', `${index + 1}번 음표 ${field.label}`);
    }
    row.querySelector('button').setAttribute('aria-label', `${index + 1}번 음표 삭제`);
  });
}
function addNote(note) {
  const row = document.createElement('div');
  row.className = 'note';
  if (note.velocity !== undefined) row.dataset.velocity = note.velocity;
  for (const { key, min, max, step } of fields) {
    const input = document.createElement('input');
    input.name = key;
    input.type = key === 'lyric' ? 'text' : 'number';
    input.value = note[key];
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (step !== undefined) input.step = step;
    row.append(input);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    const next = row.nextElementSibling ?? row.previousElementSibling;
    row.remove();
    updateCount();
    (next?.querySelector('button') ?? $('add-note')).focus();
  });
  row.append(remove);
  $('notes').append(row);
  return row;
}
function showScore(value) {
  current = validateScore(value);
  $('title').value = current.title ?? '';
  $('voice').value = current.voice;
  $('call').value = current.call;
  updateCall();
  $('notes').replaceChildren();
  for (const note of current.notes) addNote(note);
  updateCount();
}
function collect() {
  return validateScore({
    ...current,
    title: $('title').value,
    voice: $('voice').value,
    call: $('voice').value === 'cat' ? $('call').value : 'meow',
    notes: [...$('notes').children].map((row, index) => {
      const entries = fields.map(({ key }) => {
        const input = row.querySelector(`[name="${key}"]`);
        if (key !== 'lyric' && !input.value.trim()) throw Error(`${index + 1}번 음표의 시간이나 음정이 비어 있어요.`);
        return [key, key === 'lyric' ? input.value : Number(input.value)];
      });
      if (row.dataset.velocity !== undefined) entries.push(['velocity', Number(row.dataset.velocity)]);
      return Object.fromEntries(entries);
    }),
  });
}

async function loadExample() {
  try {
    const res = await fetch(new URL('./examples/meow.json', import.meta.url));
    if (!res.ok) throw Error(`예제 파일을 열 수 없어요 (HTTP ${res.status}).`);
    const example = await res.json();
    if (!initialized && $('notes').children.length > 0) return;
    showScore(example);
    announce('예제가 준비됐어요. 음표를 바꾸거나 이대로 소리를 만들어 보세요.');
  } catch (error) {
    announce(error.message, true);
  } finally {
    initialized = true;
  }
}

function localFile(id, limit) {
  const file = $(id).files[0];
  if (file && file.size > limit) throw Error('파일이 너무 커요. 짧은 파일부터 시도해 주세요.');
  return file;
}

for (const id of ['score-file', 'lyric-file', 'backing-file', 'midi-file']) {
  $(id).addEventListener('change', () => {
    $(`${id}-name`).textContent = $(id).files[0]?.name ?? '선택한 파일 없음';
  });
}

function updateCall() { $('cat-call').hidden = $('voice').value !== 'cat'; }
$('voice').addEventListener('change', updateCall);
updateCall();
$('example').addEventListener('click', loadExample);
$('add-note').addEventListener('click', () => {
  const last = $('notes').lastElementChild;
  const start = Number(last?.querySelector('[name="start"]').value) || 0;
  const length = Number(last?.querySelector('[name="duration"]').value) || 0.5;
  const row = addNote({ start: last ? Math.round((start + length) * 1000) / 1000 : 0, duration: 0.5, midi: 64, lyric: '먀' });
  updateCount();
  row.querySelector('input').focus();
});
$('score-file').addEventListener('change', async () => {
  try {
    const file = localFile('score-file', 1024 * 1024);
    if (!file) return;
    showScore(JSON.parse(await file.text()));
    initialized = true;
    announce(`${file.name} 악보를 불러왔어요.`);
  } catch (error) { announce(`악보를 불러오지 못했어요. ${error.message}`, true); }
});
$('lyric-file').addEventListener('change', async () => {
  $('lrc-preview').replaceChildren();
  $('lrc-preview').hidden = true;
  try {
    const file = localFile('lyric-file', 512 * 1024);
    if (!file) return;
    const lines = await parseLrc(await file.text());
    for (const line of lines.slice(0, 100)) {
      const item = document.createElement('li');
      item.textContent = `${ko.format(line.start)}초 · ${line.lyric}`;
      $('lrc-preview').append(item);
    }
    $('lrc-preview').hidden = !lines.length;
    announce(lines.length ? `LRC ${lines.length}줄을 읽었어요. 최대 100줄을 보여 줍니다.` : '시각 표시가 있는 가사를 찾지 못했어요.', !lines.length);
  } catch (error) { announce(`LRC를 불러오지 못했어요. ${error.message}`, true); }
});

let midiBytes;
let midiRevision=0;
$('midi-file').addEventListener('change',async()=>{
  const revision=++midiRevision;
  midiBytes=undefined;
  $('midi-editor').hidden=true;
  $('midi-track').replaceChildren();
  $('midi-lyrics').value='';
  try {
    const file=localFile('midi-file',2_000_000);
    if(!file)return;
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(revision!==midiRevision)return;
    const {tracks}=parseMidi(bytes);
    for(const [number,track] of tracks.entries()) {
      if(!track.notes.length)continue;
      const option=document.createElement('option');
      option.value=String(number);
      option.textContent=`트랙 ${number} · ${track.notes.length}개 음표`;
      $('midi-track').append(option);
    }
    if(!$('midi-track').length)throw Error('음표가 들어 있는 트랙을 찾지 못했어요.');
    midiBytes=bytes;
    $('midi-editor').hidden=false;
    announce('선율을 읽었어요. 트랙과 가사를 확인한 뒤 적용하세요.');
  } catch(error) {
    if(revision===midiRevision)announce(error.message,true);
  }
});
$('midi-apply').addEventListener('click',()=>{
  if(!midiBytes)return;
  try {
    const lyrics=$('midi-lyrics').value.trim().split(/\r?\n/);
    const voice=$('voice').value;
    showScore(scoreFromMidi(midiBytes,Number($('midi-track').value),lyrics,{
      title:$('title').value,voice,sampleRate:current.sampleRate,call:voice==='cat'?$('call').value:'meow',
    }));
    initialized=true;
    discardUrls();
    announce('선율과 가사를 현재 악보에 넣었어요.');
  } catch(error){announce(error.message,true);}
});

function discardUrls() {
  $('player').pause();
  $('player').removeAttribute('src');
  $('player').load();
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
  $('downloads').hidden = true;
}
function waveUrl(samples, rate) {
  const url = URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
  urls.push(url);
  return url;
}
function renderInWorker(score, backing) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./render-worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({data}) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || '렌더 작업자를 시작하지 못했어요.')); };
    worker.postMessage({score, backing}, backing ? [backing.samples.buffer] : []);
  });
}
$('render').addEventListener('click', async () => {
  const button = $('render');
  button.disabled = true;
  try {
    const score = collect();
    const file = localFile('backing-file', 64 * 1024 * 1024);
    announce('음표를 맞춰 녹음 중이에요…');
    const backing = file ? decodeWav(await file.arrayBuffer()) : undefined;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { sampleRate, vocal, mix } = await renderInWorker(score, backing);
    discardUrls();
    const filename = (score.title || 'mvs').replace(/[^\p{L}\p{N}_ -]/gu, '_').trim() || 'mvs';
    const vocalUrl = waveUrl(vocal, sampleRate);
    const mixUrl = waveUrl(mix, sampleRate);
    $('player').src = mixUrl;
    $('vocal-download').href = vocalUrl;
    $('vocal-download').download = `${filename}-보컬.wav`;
    $('mix-download').href = mixUrl;
    $('mix-download').download = `${filename}-믹스.wav`;
    $('downloads').hidden = false;
    announce(`완성! ${ko.format(mix.length / sampleRate)}초 · ${ko.format(sampleRate)} Hz · WAV`);
  } catch (error) {
    announce(`렌더하지 못했어요. ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});
window.addEventListener('pagehide', event => { if (!event.persisted) urls.forEach(url => URL.revokeObjectURL(url)); });
loadExample();
