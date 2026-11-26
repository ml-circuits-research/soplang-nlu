import {spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {strategyModules} from './strategies.mjs'
import {resolve, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const benchmark = fileURLToPath(new URL('./',import.meta.url))
const root = fileURLToPath(new URL('../../',import.meta.url))
const reviewTools = join(benchmark,'meaning-review')
const args=process.argv.slice(2)
const prospective=args[0]==='--prospective'
if(prospective)args.shift()
const protocolPath=join(benchmark,prospective?'next-evaluation/protocol.json':'fresh-1pct.lock.json')
const protocol=JSON.parse(readFileSync(protocolPath,'utf8'))
const [stage, first, second, ...rest] = args
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root,'..'))
const knowledge = resolve(process.env.KNOWLEDGE_DIR ?? process.env.SOP_KNOWLEDGE_DIR ??
  join(workspace,'sop-knowledge-worlds'))

function usage() {
  console.log('Usage: node tests/benchmark/fresh-eval.mjs [--prospective] STAGE [ARGS]')
  console.log('  diagnose [breadth flags]    Run the existing small development fixtures')
  console.log('  infer RUN_DIR               Draw the sealed fresh 1% and run all strategies')
  console.log('  prepare RUN_DIR REVIEW_DIR  Validate static eligibility and make blind candidate packets')
  console.log('  primary REVIEW_DIR          Review every eligible exact candidate')
  console.log('  independent REVIEW_DIR      Review the same candidates independently')
  console.log('  audit-plan REVIEW_DIR       Select all threshold disagreements and a blinded agreement audit')
  console.log('  audit REVIEW_DIR            Run fresh blind adjudication')
  console.log('  score RUN_DIR REVIEW_DIR    Grade public lists and merge timing reports')
}

function execute(command, args, env) {
  const run = spawnSync(command,args,{stdio:'inherit',env:{...(env ?? process.env),SOP_REVIEW_PROTOCOL:protocolPath}})
  if (run.error) throw run.error
  if (run.status !== 0) throw Error('Evaluation subprocess failed: '+command+' ('+(run.signal ?? run.status)+')')
}
const node = (file, args, environment) => execute(process.execPath,[file,...args],environment)
const need = (value,label) => {
  if (!value) throw Error('Missing ' + label)
  return resolve(value)
}
if (stage !== 'diagnose' && (rest.length || (second && !['prepare','score'].includes(stage)))) {
  throw Error('Unexpected additional evaluation arguments.')
}

switch (stage) {
  case undefined:
  case '--help':
  case 'help':
    usage()
    break
  case 'diagnose':
    node(join(benchmark,'analysis-breadth.mjs'),args.slice(1))
    break
  case 'infer': {
    if(prospective) {
      const destination=need(first,'RUN_DIR')
      const scratch=mkdtempSync(join(tmpdir(),'sop-reserved-sample-'))
      try{
        const sample=spawnSync(process.execPath,[join(benchmark,'reserve-unseen-sample.mjs'),protocolPath,
          join(scratch,'sample.json.gz'),'reveal'],{encoding:'utf8'})
        if(sample.error || sample.status!==0)throw Error(sample.error?.message ?? sample.stderr)
        const {population}=JSON.parse(sample.stdout)
        writeFileSync(join(scratch,'environment.json'),JSON.stringify({population,revision:protocol.datasetRevision,
          seed:protocol.seed,percent:protocol.percent}))
        node(join(benchmark,'port-run.mjs'),[scratch,destination],{...process.env,APPEND:'0',EVAL_SCHEMA:'nlu',
          NATIVE_REFERENCE_REVISION:protocol.nativeReferenceRevision,SCORE_READER_ERRORS:'1',
          STRATEGIES:Object.keys(strategyModules).join(',')})
      }finally{rmSync(scratch,{recursive:true,force:true})}
      break
    }
    node(join(benchmark,'port-run.mjs'),['-',need(first,'RUN_DIR')],{
      ...process.env, APPEND:'0', EVAL_SCHEMA:'nlu', SAMPLE_SEED:protocol.seed,
      SAMPLE_PERCENT:String(protocol.percent), DATASET_REVISION:protocol.datasetRevision,
      NATIVE_REFERENCE_REVISION:protocol.nativeReferenceRevision, STRATEGIES:protocol.strategyNames.join(',')
    })
    break
  }
  case 'prepare': {
    const run = need(first,'RUN_DIR')
    const directory = need(second,'REVIEW_DIR')
    node(join(reviewTools,'prepare-native.mjs'),[run,directory,knowledge])
    node(join(reviewTools,'review-public-candidates.mjs'),['plan',directory])
    break
  }
  case 'primary':
  case 'independent':
  case 'audit': {
    const directory = need(first,'REVIEW_DIR')
    const audit = stage === 'audit'
    const model = protocol.reviewers[audit ? 'adjudicator' : stage]
    const packets = join(directory,audit ? 'audit-packets.json.gz' : 'candidate-packets.json.gz')
    execute(process.env.PYTHON ?? 'python3',[join(reviewTools,'run-review.py'),packets,join(directory,stage+'.jsonl'),
      '--profile','native','--model',model,'--codex',process.env.REVIEW_CODEX ?? 'codex',
      '--jobs',process.env.REVIEW_JOBS ?? '8','--rows','10','--groups','24','--characters','36000','--expanded'])
    break
  }
  case 'audit-plan':
    node(join(reviewTools,'review-public-candidates.mjs'),['audit',need(first,'REVIEW_DIR')])
    break
  case 'score':
    node(join(reviewTools,'review-public-candidates.mjs'),['score',need(second,'REVIEW_DIR'),need(first,'RUN_DIR'),
      ...(prospective?[Object.keys(strategyModules).join(',')]:[])])
    break
  default:
    usage()
    throw Error('Unknown evaluation stage: ' + stage)
}

