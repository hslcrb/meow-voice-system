import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const src=dirname(fileURLToPath(import.meta.url));
const dest=resolve(process.argv[2] ?? 'out/mvs-studio');
if(dest===src || src.startsWith(dest+'/')) throw Error('소스와 다른 출력 폴더를 지정하세요.');
for(const relative of ['index.html','styles.css','app.mjs','core.mjs','midi.mjs','render-worker.mjs','examples/meow.json']){
  const target=join(dest,relative);
  await mkdir(dirname(target),{recursive:true});
  await copyFile(join(src,relative),target);
}
console.log('MVS 정적 빌드:',dest);
