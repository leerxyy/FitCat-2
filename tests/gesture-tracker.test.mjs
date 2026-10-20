import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureTracker, validHand, handPose } from '../js/core/gesture-tracker.js';
const hand=()=>Array.from({length:21},(_,i)=>({x:.4+(i%4)*.04,y:.7-Math.floor(i/4)*.06}));
test('bad or missing landmarks clear tracking instead of throwing or clicking',()=>{
 const tracker=new GestureTracker();for(const value of [null,[],[{x:1,y:2}],Array(21).fill({x:NaN,y:0})])assert.equal(tracker.update(value,0),null);assert.equal(validHand(hand()),true);
});
test('a pinch emits one click, has release hysteresis and emits another only after reopening',()=>{
 const tracker=new GestureTracker(),h=hand();h[8]={x:.5,y:.5};h[4]={x:.51,y:.5};
 assert.equal(tracker.update(h,1).pinchStarted,true);assert.equal(tracker.update(h,2).pinchStarted,false);h[4].x=.55;assert.equal(tracker.update(h,3).pinch,true);h[4].x=.58;assert.equal(tracker.update(h,3.5).pinch,false);
 h[4].x=.51;assert.equal(tracker.update(h,4).pinchStarted,true);
});
test('horizontal motion emits a single tab change and respects a time cooldown',()=>{
 const tracker=new GestureTracker(),h=hand();h[4]={x:.9,y:.9};h[8]={x:.5,y:.4};tracker.update(h,0);h[0].x-=.1;
 assert.equal(tracker.update(h,100).swipe,1);h[0].x-=.1;assert.equal(tracker.update(h,180).swipe,0);
});
test('vertical movement returns scrolling, while a pinch suppresses movement actions',()=>{
 const tracker=new GestureTracker(),h=hand();h[4]={x:.9,y:.9};h[8]={x:.5,y:.4};tracker.update(h,0);h[0].y+=.06;assert.ok(tracker.update(h,100).scroll>0);
 h[4]={...h[8]};h[0].y+=.06;const next=tracker.update(h,200);assert.equal(next.scroll,0);assert.equal(next.swipe,0);
});
const palm=()=>{const h=hand();h[4]={x:.1,y:.5};h[8]={x:.5,y:.2};for(const index of [12,16,20])h[index].y=.15;for(const index of [6,10,14,18])h[index].y=.5;return h;};
test('held hand poses fire once, and require a stable dwell instead of a frame count',()=>{
 const tracker=new GestureTracker(),h=palm();assert.equal(handPose(h),'palm');assert.equal(tracker.update(h,0).poseAction,'');assert.equal(tracker.update(h,300).poseAction,'');assert.equal(tracker.update(h,500).poseAction,'palm');assert.equal(tracker.update(h,1500).poseAction,'');
 const fist=palm();for(const index of [8,12,16,20])fist[index].y=.7;assert.equal(handPose(fist),'fist');
 const shaka=palm();for(const index of [8,12,16])shaka[index].y=.7;assert.equal(handPose(shaka),'shaka');
});
test('a completed palm swipe does not automatically send the user back to Today',()=>{
 const tracker=new GestureTracker(),h=palm();tracker.update(h,0);h[0].x-=.14;assert.equal(tracker.update(h,100).swipe,1);assert.equal(tracker.update(h,1200).poseAction,'');
 tracker.update(null,1300);assert.equal(tracker.update(h,1400).poseAction,'');assert.equal(tracker.update(h,2000).poseAction,'palm');
});
