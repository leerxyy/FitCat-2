import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDOM} from './dom.mjs';

test('the DOM double indexes static IDs and immediately observes renames and removals',()=>{
 const env=setupDOM();try{const node=document.getElementById('profileName');assert.ok(node);assert.equal(document.getElementById('profileName'),node);node.id='renamed:profile';assert.equal(document.getElementById('profileName'),null);assert.equal(document.getElementById('renamed:profile'),node);node.removeAttribute('id');assert.equal(document.getElementById('renamed:profile'),null);}finally{env.restoreTimers();}
});
test('detached IDs are excluded, and appending or reattaching them makes them visible',()=>{
 const env=setupDOM();try{const node=document.createElement('div');node.id='added';assert.equal(document.getElementById('added'),null);document.body.append(node);assert.equal(document.getElementById('added'),node);node.remove();assert.equal(document.getElementById('added'),null);document.body.append(node);assert.equal(document.getElementById('added'),node);}finally{env.restoreTimers();}
});
test('duplicate IDs resolve in document order after removals and reinsertions',()=>{
 const env=setupDOM();try{const first=document.getElementById('profileName'),second=document.createElement('input');second.id='profileName';document.body.append(second);assert.equal(document.getElementById('profileName'),first);first.remove();assert.equal(document.getElementById('profileName'),second);document.body.append(first);assert.equal(document.getElementById('profileName'),second);second.remove();assert.equal(document.getElementById('profileName'),first);}finally{env.restoreTimers();}
});
