import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWav, encodeWav, parseLrc, renderScore, validateScore } from '../core.mjs';
const score = (voice='cat', call='meow') => ({version:1, voice, call, sampleRate:16000, notes:[
  {start:.1,duration:.35,midi:69,lyric:'먀'}, {start:.55,duration:.25,midi:72,lyric:'용'}
]});
test('score is ordered, monophonic, bounded, and versioned', () => {
  assert.equal(validateScore(score()).notes.length, 2);
  for (const notes of [[], [{...score().notes[0], start:-.1}], [{...score().notes[0], midi:130}], [{...score().notes[0], duration:Infinity}], [score().notes[1],score().notes[0]], [score().notes[0],{...score().notes[1],start:.2}]]) {
    assert.throws(() => validateScore({...score(),notes}));
  }
  assert.throws(() => validateScore({...score(),version:2}));
});
test('all voice and feline call variants are finite and repeatable', () => {
  const a=renderScore(score());
  assert.deepEqual(a.vocal,renderScore(score()).vocal);
  assert.equal(a.vocal.length,12800);
  assert.ok(a.vocal.slice(0,1600).every(v=>v===0));
  for(const [voice,call] of [['human','meow'],['hybrid','meow'],['cat','purr'],['cat','hiss'],['cat','growl'],['cat','chirp']]){
    const b=renderScore(score(voice,call)).vocal;
    assert.ok(b.every(Number.isFinite));
    assert.ok(b.some(v=>Math.abs(v)>.001));
    assert.notDeepEqual(b,a.vocal);
  }
});
test('human sustained A4 keeps the requested fundamental', () => {
  const a=renderScore(score('human')).vocal.slice(3300,6500);
  const magnitude = hz => Math.hypot(...[Math.cos,Math.sin].map(fn=>a.reduce((sum,x,i)=>sum+x*fn(2*Math.PI*hz*i/16000),0)));
  assert.ok(magnitude(440)>5*magnitude(410));
  assert.ok(magnitude(440)>5*magnitude(470));
});
test('backing resamples at time zero and mix stays bounded',()=>{
  const b=renderScore(score(),{backing:{sampleRate:8000,samples:Float32Array.from({length:8000},()=>.25)}});
  assert.equal(b.mix.length,16000);
  assert.ok(b.mix.every(x=>Math.abs(x)<=1));
  assert.equal(b.vocal[0],0);
  assert.ok(b.mix[0]>.1);
  assert.ok(b.mix[15999]>.1);
});
test('PCM16 roundtrip and malformed input validation',()=>{
  const wav=encodeWav(new Float32Array([0,.5,-.5,.25]),16000);
  const {samples,sampleRate}=decodeWav(wav);
  assert.equal(sampleRate,16000);
  assert.ok(Math.abs(samples[1]-.5)<1/30000);
  assert.throws(()=>decodeWav(wav.slice(0,43)));
});
test('LRC gives lyric start times without inventing pitch',()=>{
  assert.deepEqual(parseLrc('[ar:TEST]\n[00:01.05][00:02.500]먀\n[00:03.00]용'),[{start:1.05,lyric:'먀'},{start:2.5,lyric:'먀'},{start:3,lyric:'용'}]);
  assert.throws(()=>parseLrc('no timestamps'));
});
test('canonically equivalent Hangul lyrics render identical WAV bytes without changing the text',()=>{
  for(const voice of ['cat','human','hybrid']){
    for(const text of ['이','냐옹','뿌리']){
      const nfc=text.normalize('NFC'), nfd=text.normalize('NFD');
      assert.notEqual(nfc,nfd);
      const make=lyric=>({...score(voice),notes:[{start:.12,duration:.42,midi:69,lyric}]});
      const source=make(nfd);
      assert.deepEqual(validateScore(source).notes, [{...source.notes[0],velocity:.8}]);
      const first=renderScore(make(nfc)), second=renderScore(source);
      assert.equal(first.mix.length,8640);
      assert.ok(second.vocal.subarray(0,1920).every(x=>x===0));
      assert.equal(Buffer.compare(encodeWav(second.mix,second.sampleRate),encodeWav(first.mix,first.sampleRate)),0,voice+' '+text);
      assert.equal(source.notes[0].lyric,nfd);
    }
  }
});
