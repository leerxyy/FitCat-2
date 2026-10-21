// DeviceOrientation uses intrinsic Z–X′–Y″ rotations. A relative quaternion
// avoids the discontinuous Euler angles around an upright phone and 0/360°.
// https://www.w3.org/TR/orientation-event/#deviceorientation
const radians = Math.PI / 180;
const multiply = ([ax,ay,az,aw],[bx,by,bz,bw]) => [
  aw*bx+ax*bw+ay*bz-az*by,
  aw*by-ax*bz+ay*bw+az*bx,
  aw*bz+ax*by-ay*bx+az*bw,
  aw*bw-ax*bx-ay*by-az*bz,
];
export function tiltPose(event) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  const alpha=(Number.isFinite(event.alpha)?event.alpha:0)*radians/2;
  const beta=event.beta*radians/2,gamma=event.gamma*radians/2;
  return multiply(multiply([0,0,Math.sin(alpha),Math.cos(alpha)],
    [Math.sin(beta),0,0,Math.cos(beta)]),[0,Math.sin(gamma),0,Math.cos(gamma)]);
}
export function tiltOffset(origin,pose,screenAngle=0) {
  let q=multiply([-origin[0],-origin[1],-origin[2],origin[3]],pose);
  if(q[3]<0)q=q.map(value=>-value);
  const length=Math.hypot(q[0],q[1],q[2]);
  if(length<1e-8)return {x:0,y:0};
  const angle=2*Math.atan2(length,Math.max(0,q[3]))/radians;
  const horizontal=q[1]/length*angle,vertical=q[0]/length*angle;
  const rotation=screenAngle*radians;
  const quiet=value=>Math.abs(value)<=.25?0:Math.sign(value)*(Math.abs(value)-.25);
  return {
    x:26*Math.tanh(quiet(horizontal*Math.cos(rotation)+vertical*Math.sin(rotation))/20),
    y:22*Math.tanh(quiet(vertical*Math.cos(rotation)-horizontal*Math.sin(rotation))/20),
  };
}
