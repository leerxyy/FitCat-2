import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutViewport, landscape, phone } from '../js/ui/viewport.js';

function fixture({ width=390, height=742, probe=height, screenWidth=390, screenHeight=844, agent='iPhone', installed=true } = {}) {
  const root={clientWidth:width,clientHeight:height,style:{getPropertyValue:()=>''}};
  const doc={documentElement:root,getElementById:()=>({getBoundingClientRect:()=>({height:probe})})};
  const win={innerWidth:width,innerHeight:height,screen:{width:screenWidth,height:screenHeight},matchMedia:q=>({matches:q.includes('standalone')?installed:true})};
  const nav={userAgent:agent,standalone:installed};
  return {win,doc,nav};
}

test('cold launch uses full-screen iPhone extent even when both window and CSS viewport remain short', () => {
  const f=fixture();
  assert.deepEqual(layoutViewport(f.win,f.doc,f.nav),{width:390,height:844});
  f.win.screen={width:393,height:852}; f.win.innerWidth=393;
  assert.equal(layoutViewport(f.win,f.doc,f.nav).height,852);
});

test('the iPhone fallback respects actual landscape dimensions', () => {
  const f=fixture({width:844,height:330,probe:330});
  assert.equal(layoutViewport(f.win,f.doc,f.nav).height,390);
});

test('ordinary tabs, Android status bars and iPad split windows never adopt the full iPhone screen height', () => {
  const tab=fixture({installed:false}); assert.equal(layoutViewport(tab.win,tab.doc,tab.nav).height,742);
  const android=fixture({agent:'Android Mobile'}); assert.equal(layoutViewport(android.win,android.doc,android.nav).height,742);
  const ipad=fixture({width:700,height:680,screenWidth:1024,screenHeight:1366,agent:'iPad'});
  assert.equal(layoutViewport(ipad.win,ipad.doc,ipad.nav).height,680);
  const narrow=fixture({width:340}); assert.equal(layoutViewport(narrow.win,narrow.doc,narrow.nav).height,742);
});

test('an independent CSS probe supersedes a stale innerHeight and the shell is not used as its own ruler', () => {
  const f=fixture({installed:false,height:640,probe:800});
  assert.equal(layoutViewport(f.win,f.doc,f.nav).height,800);
  f.doc.getElementById=()=>null; f.doc.documentElement.clientHeight=780;
  assert.equal(layoutViewport(f.win,f.doc,f.nav).height,780);
});

test('a portrait keyboard does not masquerade as physical landscape', () => {
  const f=fixture({height:320,probe:844}); f.win.orientation=0;
  assert.equal(landscape(f.win,f.doc),false);
  f.win.orientation=90; assert.equal(landscape(f.win,f.doc),true);
  f.win.screen.orientation={type:'portrait-primary'}; assert.equal(landscape(f.win,f.doc),false);
});

test('desktop and tablet layouts do not receive a phone orientation guard', () => {
  const f=fixture({screenWidth:1920,screenHeight:1080,agent:'Desktop'}); f.win.matchMedia=()=>({matches:false});
  assert.equal(phone(f.win,f.nav),false);
  assert.equal(phone(f.win,{userAgent:'Android Mobile'}),true);
});
