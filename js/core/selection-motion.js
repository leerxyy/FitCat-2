// An analytic, critically damped spring: stable at both 60 and 120 Hz.
// The release keeps its current position and useful velocity, without overshoot.
export function settleSelection(position, velocity, target, milliseconds, frequency = 14) {
  const dt = Math.max(0, Math.min(64, milliseconds)) / 1000;
  const delta = position - target;
  if (Math.abs(delta) < .015 && Math.abs(velocity) < .15) return { position: target, velocity: 0, done: true };
  if (delta * velocity > 0) velocity = 0;
  velocity = Math.sign(velocity) * Math.min(Math.abs(velocity), Math.abs(delta) * frequency);
  const coefficient = velocity + frequency * delta, decay = Math.exp(-frequency * dt);
  const next = target + (delta + coefficient * dt) * decay;
  const speed = (velocity - frequency * coefficient * dt) * decay;
  const done = Math.abs(next - target) < .015 && Math.abs(speed) < .15;
  return { position: done ? target : next, velocity: done ? 0 : speed, done };
}
