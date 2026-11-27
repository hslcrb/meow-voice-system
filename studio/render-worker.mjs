import {renderScore} from './core.mjs';
self.onmessage = ({data:{score,backing}}) => {
  try {
    const result=renderScore(score,{backing});
    self.postMessage(result,[result.vocal.buffer,result.mix.buffer]);
  } catch(error) {
    self.postMessage({error:error.message});
  }
};
