import {fileURLToPath} from 'node:url'
import {openGraphWorker} from '../../strategies/distilbert/index.mjs'

export const sequenceGraph={
  name:'sequence-graph',
  open(options){
    return openGraphWorker({...options,workerPath:fileURLToPath(new URL('./infer.py',import.meta.url))})
  }
}
