import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeWav,encodeWav} from '../core.mjs';
const invoke=(...args)=>spawnSync(process.execPath,['studio/cli.mjs',...args],{encoding:'utf8'});
test('CLI validates, mixes real WAV backing and emits an independent vocal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mvs-cli-'));
  try {
    const mr=join(dir,'mr.wav'),out=join(dir,'mix.wav'),stem=join(dir,'vocal.wav');
    writeFileSync(mr,encodeWav(new Float32Array(64000).fill(.1),16000));
    const check=invoke('validate','studio/examples/meow.json');
    assert.equal(check.status,0,check.stderr);
    assert.equal(JSON.parse(check.stdout).notes,5);
    const r=invoke('render','studio/examples/meow.json','--out',out,'--backing',mr,'--vocal',stem);
    assert.equal(r.status,0,r.stderr);
    assert.equal(decodeWav(readFileSync(out)).samples.length,176400);
    assert.equal(decodeWav(readFileSync(stem)).samples[0],0);
    assert.ok(decodeWav(readFileSync(out)).samples[0]>.05);
  } finally{rmSync(dir,{recursive:true,force:true});}
});
test('show is self-contained, reflects escaped lyrics, and embeds playable WAV',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mvs-show-'));
  try {
    const raw=JSON.parse(readFileSync('studio/examples/meow.json'));
    raw.title='<script>alert(9)</script>';
    const inFile=join(dir,'score.json'),out=join(dir,'show.html');
    writeFileSync(inFile,JSON.stringify(raw));
    const r=invoke('show',inFile,'--out',out);
    assert.equal(r.status,0,r.stderr);
    const html=readFileSync(out,'utf8');
    assert.ok(html.includes('&lt;script&gt;alert(9)&lt;/script&gt;'));
    assert.ok(html.includes('data:audio/wav;base64,UklGR'));
    assert.ok(!html.includes('<script>alert(9)'));
  } finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI refuses unrecognized options and no partial output on validation failure',()=>{
  assert.notEqual(invoke('render','studio/examples/meow.json','--at','3').status,0);
  assert.notEqual(invoke('render','studio/examples/meow.json','--out','/tmp/mvs-invalid.mid').status,0);
});
