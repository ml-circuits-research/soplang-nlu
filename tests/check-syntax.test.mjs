import test from 'node:test'
import assert from 'node:assert/strict'
import {checkSyntax} from '../lib/check-syntax.mjs'

const token=(id,text,start,pos)=>({id,type:'w.syntax.token',attrs:{text:[text],start:[String(start)],end:[String(start+text.length)],pos:[pos]}})
test('detects a missing negation even when every remaining offset is exact',()=>{
  const result=checkSyntax('not red',[token('a','red',4,'adjective')])
  assert.equal(result.ok,false)
  assert.deepEqual(result.unexplained,[{start:0,end:3,text:'not'}])
})
test('detects a swapped head and modifier despite complete token coverage',()=>{
  const words=[token('a','red',0,'adjective'),token('b','circle',4,'noun')]
  const phrase={id:'p',type:'w.syntax.phrase',attrs:{start:['0'],end:['10'],text:['red circle'],head:['$b'],modifier:['$a']}}
  assert.equal(checkSyntax('red circle',[...words,phrase]).ok,true)
  const swapped={...phrase,attrs:{...phrase.attrs,head:['$a'],modifier:['$b']}}
  const result=checkSyntax('red circle',[...words,swapped])
  assert.equal(result.ok,false)
  assert.equal(result.unexplained.length,0)
  assert.ok(result.issues.some(issue=>issue.reason==='unexpected-head-class'))
})
