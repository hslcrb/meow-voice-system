import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, scoreFromMidi } from '../midi.mjs';
const hex=x=>Buffer.from(x.replace(/\s/g,''),'hex');
const track=x=>{const body=hex(x),len=Buffer.alloc(4);len.writeUInt32BE(body.length);return Buffer.concat([Buffer.from('MTrk'),len,body]);};
const end='00 ff 2f 00';
const one=Buffer.concat([hex('4d546864 00000006 0000 0001 01e0'),track('00 90 45 64 83 60 45 00 81 70 48 7f 83 60 80 48 00 '+end)]);
const two=Buffer.concat([hex('4d546864 00000006 0001 0002 01e0'),
  track('00 ff 51 03 07 a1 20 83 60 ff 51 03 0f 42 40 '+end),
  track('00 90 45 64 87 40 80 45 00 '+end)]);
test('format 0 keeps leading time and gaps, running status and note-on zero',()=>{
  const m=parseMidi(one);
  assert.equal(m.format,0);
  assert.deepEqual(m.tracks[0].notes.map(n=>[n.start,n.duration,n.midi]),[[0,.5,69],[.75,.5,72]]);
});
test('format 1 conductor tempo change mid-note is integrated',()=>{
  const m=parseMidi(two);
  assert.equal(m.tracks[0].notes.length,0);
  assert.equal(m.tracks[1].notes[0].duration,1.5);
});
test('explicit lyrics and track are required; no lyric or pitch inference',()=>{
  assert.throws(()=>scoreFromMidi(two,0,['먀']),/음표/);
  assert.throws(()=>scoreFromMidi(one,0,['먀']),/개수/);
  const s=scoreFromMidi(one,0,['먀','용']);
  assert.deepEqual(s.notes.map(x=>[x.midi,x.lyric]),[[69,'먀'],[72,'용']]);
});
test('rejects malformed files, SMPTE, incomplete and overlapping notes',()=>{
  assert.throws(()=>parseMidi(one.subarray(0,-1)));
  const bad=Buffer.from(one);bad[12]=0xe7;assert.throws(()=>parseMidi(bad),/SMPTE/);
  assert.throws(()=>parseMidi(Buffer.concat([one.subarray(0,14),track('00 90 40 40 '+end)])),/종료/);
  const chord=Buffer.concat([one.subarray(0,14),track('00 90 40 40 00 90 43 40 60 80 40 00 00 80 43 00 '+end)]);
  assert.throws(()=>scoreFromMidi(chord,0,['먀','용']),/겹치/);
});

test('CLI imports a chosen MIDI track with supplied lyrics and renders actual WAV', async () => {
  const {spawnSync}=await import('node:child_process');
  const {mkdtempSync,readFileSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {decodeWav}=await import('../core.mjs');
  const d=mkdtempSync(join(tmpdir(),'mvs-midi-'));
  try {
    const midi=join(d,'local.mid'),lyrics=join(d,'lyrics.json'),score=join(d,'score.json'),wav=join(d,'out.wav');
    writeFileSync(midi,two);writeFileSync(lyrics,JSON.stringify(['먀']));
    const cli=(...args)=>spawnSync(process.execPath,['studio/cli.mjs',...args],{encoding:'utf8'});
    const listed=cli('midi-list',midi);
    assert.equal(listed.status,0,listed.stderr);
    assert.deepEqual(JSON.parse(listed.stdout).tracks,[{number:0,notes:0},{number:1,notes:1}]);
    const imported=cli('midi-import',midi,'--track','1','--lyrics',lyrics,'--out',score);
    assert.equal(imported.status,0,imported.stderr);
    assert.equal(JSON.parse(readFileSync(score)).notes[0].duration,1.5);
    const rendered=cli('render',score,'--out',wav);
    assert.equal(rendered.status,0,rendered.stderr);
    assert.equal(decodeWav(readFileSync(wav)).samples.length,66150);
    assert.notEqual(cli('midi-import',midi,'--track','0','--lyrics',lyrics,'--out',score).status,0);
  } finally {rmSync(d,{recursive:true,force:true});}
});
