// Optional test harness; packages live outside the repository.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {parseMidi} from '../midi.mjs';

if (!process.argv[2]) throw Error('사용법: node studio/experiments/compare-timing.mjs /path/to/ruby-runtime');
const runtime=resolve(process.argv[2]);
const anchor=createRequire(join(runtime,'experiment.cjs'));
const init=performance.now();
const {DefaultRubyVM}=anchor('@ruby/wasm-wasi/dist/node');
const {vm}=await DefaultRubyVM(await WebAssembly.compile(await readFile(join(runtime,'node_modules/@ruby/4.0-wasm-wasi/dist/ruby.wasm'))));
const ruby=vm.eval('RUBY_DESCRIPTION').toString();
vm.eval(await readFile(new URL('./timing.rb',import.meta.url),'utf8'));
const setupMs=performance.now()-init;

const raw=Buffer.from('4d546864000000060001000201e04d54726b0000001300ff510307a1208360ff51030f424000ff2f004d54726b0000000d00904564874080450000ff2f00','hex');
const {start,duration}=parseMidi(raw).tracks[1].notes[0];
const js=[Math.round(start*44100),Math.round((start+duration)*44100)];
const rubyResult=JSON.parse(vm.eval('MvsTiming.frame_window(480, [[0, 500000],[480, 1000000]], 0, 960, 44100).inspect').toString());
assert.deepEqual(js,[0,66150]);
assert.deepEqual(rubyResult,js);
assert.equal(vm.eval('MvsTiming.frame_window(480, [], 240, 720, 48000).inspect').toString(),'[12000, 36000]');
assert.equal(vm.eval('MvsTiming.frame_window(480, [[480, 1000000]], 480, 960, 16000).inspect').toString(),'[8000, 24000]');
assert.equal(vm.eval('begin; MvsTiming.frame_window(0, [], 0, 1, 44100); false; rescue ArgumentError; true; end').toString(),'true');
assert.equal(vm.eval('begin; MvsTiming.frame_window(480, [[10, 400000], [5, 500000]], 0, 1, 44100); false; rescue ArgumentError; true; end').toString(),'true');
const elapsed=Number(vm.eval('t=Process.clock_gettime(Process::CLOCK_MONOTONIC); 10000.times { MvsTiming.frame_window(480, [[0, 500000],[480,1000000]], 0,960,44100) }; (Process.clock_gettime(Process::CLOCK_MONOTONIC)-t)*1000').toString());
const jsStarted=performance.now();
for(let i=0;i<10000;i++){const n=parseMidi(raw).tracks[1].notes[0]; Math.round((n.start+n.duration)*44100);}
const jsWholeParseMs=performance.now()-jsStarted;
console.log(JSON.stringify({ruby,js,frames:rubyResult,checks:5,setupMs:Number(setupMs.toFixed(2)),rubyTenThousandMs:Number(elapsed.toFixed(2)),jsWholeParseTenThousandMs:Number(jsWholeParseMs.toFixed(2))}));
