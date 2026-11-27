import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeWav} from '../core.mjs';

const wrap=(s,other='')=>`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>밤의 먀용</work-title></work><part-list>
<score-part id="P1"><part-name>보컬</part-name></score-part>${other}
</part-list><part id="P1">${s}</part></score-partwise>`;
const attrs=(div=4)=>`<attributes><divisions>${div}</divisions></attributes>`;
const lyric=(s,number='')=>`<lyric ${number?'number="'+number+'"':''}><text>${s}</text></lyric>`;
const note=(step,alter,duration,tail='',tie='')=>`<note><pitch><step>${step}</step><alter>${alter}</alter><octave>4</octave></pitch><duration>${duration}</duration>${tie}${tail}</note>`;
const rest=(duration)=>`<note><rest/><duration>${duration}</duration></note>`;
const speed=(tempo)=>`<direction><direction-type><words>tempo</words></direction-type><sound tempo="${tempo}"/></direction>`;
const bar=(s)=>`<measure number="1">${s}</measure>`;
const simple=attrs()+speed(120)+note('A',0,4,lyric('먀'));

function run(xml, options, check) {
  const dir=mkdtempSync(join(tmpdir(),'mvs-xml-test-'));
  const input=join(dir,'original.musicxml'),out=join(dir,'score.json');
  try {
    writeFileSync(input,xml);
    const invoke=(...args)=>spawnSync('python3',['studio/musicxml.py',input,'--out',out,...args],{encoding:'utf8'});
    check({r:invoke(...options),input,out,dir,invoke});
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

test('local MusicXML to valid JSON, rendered pitch and exact quiet intervals',()=>{
  const first=bar(attrs()+speed(120)+rest(2)+note('A',0,4,lyric('먀'),'<tie type="start"/>'));
  const second=bar(attrs(8)+speed(60)+note('A',0,4,'','<tie type="stop"/>')+rest(2)+note('C',1,6,lyric('용')));
  run(wrap(first+second),['--voice','human'],({r,out,dir,invoke})=>{
    assert.equal(r.status,0,r.stderr);
    const score=JSON.parse(readFileSync(out));
    assert.equal(score.title,'밤의 먀용');
    assert.equal(score.voice,'human');
    assert.deepEqual(score.notes,[
      {start:.25,duration:1,midi:69,lyric:'먀'},
      {start:1.5,duration:.75,midi:61,lyric:'용'},
    ]);
    const existing=readFileSync(out);
    const repeat=invoke('--voice','cat');
    assert.equal(repeat.status,2,repeat.stderr);
    assert.deepEqual(readFileSync(out),existing);
    const wav=join(dir,'render.wav');
    const rendered=spawnSync(process.execPath,['studio/cli.mjs','render',out,'--out',wav],{encoding:'utf8'});
    assert.equal(rendered.status,0,rendered.stderr);
    const {samples,sampleRate}=decodeWav(readFileSync(wav));
    assert.equal(sampleRate,44100);
    assert.equal(samples.length,99225);
    assert.ok(samples.slice(0,11025).every(x=>x===0));
    assert.ok(samples.slice(55125,66150).every(x=>x===0));
    assert.ok(samples.slice(14500,21500).some(x=>Math.abs(x)>.04));
    const a=samples.slice(22050,26460);
    const correlation=(lag)=>a.slice(lag).reduce((sum,x,i)=>sum+x*a[i],0);
    assert.ok(correlation(100)>correlation(98));
    assert.ok(correlation(100)>correlation(103));
  });
});

test('selects a single embedded verse explicitly and keeps escaped text',()=>{
  const xml=wrap(bar(attrs()+speed(120)+note('A',0,4,lyric('가','1')+lyric('나&amp;다','2'))));
  run(xml,[],({r,out})=>{assert.equal(r.status,2); assert.match(r.stderr,/--verse/); assert.equal(existsSync(out),false);});
  run(xml,['--verse','2'],({r,out})=>{
    assert.equal(r.status,0,r.stderr);
    assert.equal(JSON.parse(readFileSync(out)).notes[0].lyric,'나&다');
  });
});

test('rejects ambiguous or unsupported rhythm, pitch and missing lyrics without an output',()=>{
  const bad=[
    [simple+'<backup><duration>4</duration></backup>',/다성|backup/],
    [simple+'<barline><repeat direction="backward"/></barline>',/반복/],
    [simple+note('A',.5,4,lyric('먀')),/정수 음정/],
    [attrs()+note('A',0,4,lyric('먀')),/템포/],
    [simple+note('B',0,4),/가사/],
    [simple.replace('tempo="120"','tempo="0"'),/템포/],
    [attrs()+speed(120)+note('A',0,4,lyric('먀'),'<tie type="stop"/>'),/붙임줄/],
    [simple.replace('<note>','<note attack="1">'),/어택/],
    [simple+'<direction><direction-type><metronome/></direction-type></direction>',/템포/],
    [simple+rest(4),/마지막 쉼표/],
  ];
  for (const [measure,error] of bad) run(wrap(bar(measure)),[],({r,out})=>{
    assert.equal(r.status,2,r.stderr); assert.match(r.stderr,error); assert.equal(existsSync(out),false);
  });
});

test('rejects non-local XML expansion, ZIP input and files beyond the byte limit',()=>{
  const inputs=[
    [wrap(bar(simple)).replace('<score-partwise','<!DOCTYPE score-partwise SYSTEM "https://example.invalid/example.dtd"><score-partwise'),/DOCTYPE/],
    [Buffer.from([0x50,0x4b,0x03,0x04]),/압축/],
    [' '.repeat(2_000_001),/크기/],
  ];
  for(const [payload,error] of inputs) run(payload,[],({r,out})=>{
    assert.equal(r.status,2); assert.match(r.stderr,error); assert.equal(existsSync(out),false);
  });
});
