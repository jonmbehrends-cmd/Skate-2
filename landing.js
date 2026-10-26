/* SOL SKATE — deterministic airborne board rotation and landing validation.
 * The target counts full rotations; simply being level at takeoff is not a landed trick.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const ACCEL = 170;
  const MAX_SPEED = 18;
  function axis(position, velocity, target, dt) {
    const remaining = target - position;
    if (Math.abs(remaining) < .025 && Math.abs(velocity) < .8) return { angle: target, velocity: 0 };
    const direction = Math.sign(remaining) || -Math.sign(velocity);
    const stoppingDistance = velocity * velocity / (2 * ACCEL);
    const shouldBrake = Math.sign(velocity) === direction && Math.abs(remaining) <= stoppingDistance + .12;
    const acceleration = shouldBrake ? -Math.sign(velocity) * ACCEL : direction * ACCEL;
    const nextVelocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity + acceleration * dt));
    let nextAngle = position + (velocity + nextVelocity) * .5 * dt;
    if ((target - position) * (target - nextAngle) <= 0) return { angle: target, velocity: 0 };
    return { angle: nextAngle, velocity: nextVelocity };
  }
  function step(state, flipCount, spinCount, dt) {
    const h = Math.max(0, Math.min(.04, Number.isFinite(dt) ? dt : 0));
    const roll = axis(state.rollAngle || 0, state.rollVelocity || 0, flipCount * TAU, h);
    const yaw = axis(state.yawAngle || 0, state.yawVelocity || 0, spinCount * TAU, h);
    state.rollAngle = roll.angle;
    state.rollVelocity = roll.velocity;
    state.yawAngle = yaw.angle;
    state.yawVelocity = yaw.velocity;
    return state;
  }
  function canLand(state, flipCount, spinCount) {
    return Math.abs((state.rollAngle || 0) - flipCount * TAU) <= .32 &&
      Math.abs((state.yawAngle || 0) - spinCount * TAU) <= .32 &&
      Math.abs(state.rollVelocity || 0) <= 3 && Math.abs(state.yawVelocity || 0) <= 3;
  }
  function reset(state) {
    state.rollAngle = state.rollVelocity = state.yawAngle = state.yawVelocity = 0;
    return state;
  }
  root.SOLLanding = { step, canLand, reset, TAU };
})(typeof window !== 'undefined' ? window : globalThis);
