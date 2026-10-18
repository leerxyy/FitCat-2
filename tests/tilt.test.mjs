import test from 'node:test';
import assert from 'node:assert/strict';
import { tiltPose,tiltOffset } from '../js/core/tilt.js';
const pose=(beta,gamma,alpha=0)=>tiltPose({alpha,beta,gamma});
test('relative tilt centers any starting pose, and rejects missing sensor data',()=>{
 assert.equal(tiltPose({beta:null,gamma:0}),null);assert.equal(tiltPose({beta:0,gamma:NaN}),null);
 for(const reading of [[0,0,0],[89,35,200],[-55,-60,359],[180,0,0]]){
  const p=pose(...reading);assert.deepEqual(tiltOffset(p,p),{x:0,y:0});
 }
});
test('tilt follows local screen axes even while held almost upright',()=>{
 const center=pose(89,0,45),right=tiltOffset(center,pose(89,20,45)),down=tiltOffset(center,pose(99,0,45));
 assert.ok(right.x>10&&Math.abs(right.y)<.01);assert.ok(down.y>5&&Math.abs(down.x)<.01);
 const rotated=tiltOffset(center,pose(89,20,45),90);assert.ok(Math.abs(rotated.x)<.01&&rotated.y< -10);
});
test('angle wraparound, tiny hand tremor and extreme poses never create unbounded jumps',()=>{
 const near=tiltOffset(pose(80,15,359.8),pose(80,15,.2));assert.ok(Math.hypot(near.x,near.y)<1);
 assert.deepEqual(tiltOffset(pose(45,0),pose(45,.1)),{x:0,y:0});
 for(const reading of [[80,80,90],[-80,-80,270],[180,0,359]]){
  const offset=tiltOffset(pose(45,0),pose(...reading));assert.ok(Number.isFinite(offset.x)&&Number.isFinite(offset.y));assert.ok(Math.abs(offset.x)<=26&&Math.abs(offset.y)<=22);
 }
});
