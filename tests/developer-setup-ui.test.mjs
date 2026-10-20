import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM,submit,tick } from './dom.mjs';
test('a developer command in initial setup creates the clean profile and grants once',async()=>{
 const env=setupDOM();const $=id=>document.getElementById(id);
 try{
  await import('../js/app.js');for(const[id,value]of[['setupName','Root /dev'],['setupAge','20'],['setupGender','male'],['setupHeight','170'],['setupWeight','70']])$(id).value=value;
  submit($('setupForm'));await tick();await tick();await tick();
  const {state}=await import('../js/core/store.js');const {getWallet}=await import('../js/features/wallet.js');assert.equal(state.profile.name,'Root');assert.equal(getWallet().snapshot().balance,999999);assert.equal(state.achievements.developer,true);assert.equal($('mainPage').hidden,false);assert.equal($('setupPage').hidden,true);
 }finally{env.restoreTimers();}
});
