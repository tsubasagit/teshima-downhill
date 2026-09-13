/* 走るしくみだけを取り出したファイル。3Dの知識がなくても読めます。
   settings.js の数字 → この計算 → game.js で絵にする、という順番です。 */
const RidePhysics = (() => {
  function advance(state, input, config, elapsed) {
    // 長い1回を小さな時間に分けると、重いPCでも横すべりが安定する。
    const count = Math.max(1, Math.ceil(elapsed * 120));
    const dt = elapsed / count;
    for (let i = 0; i < count; i++) {
      const targetSpeed = config.speed * state.speedScale * (input.brake ? config.brakeFactor : 1);
      const oldSpeed = state.currentSpeed;
      const response = Math.max(0.01, config.accelerationResponse);
      state.currentSpeed += (targetSpeed - state.currentSpeed) * (1 - Math.exp(-dt * response));
      // ★ 距離 = 速さ × 時間。発進中も積分して、fpsによる差をなくす。
      state.distance = Math.min(state.totalLength, state.distance + targetSpeed * dt
        + (oldSpeed - targetSpeed) * (1 - Math.exp(-dt * response)) / response);
      state.smoothInput += (input.steer - state.smoothInput) * (1 - Math.exp(-dt / config.steeringResponse));
      // 摩擦で少し減速 → 押している方向へ加速 → 道幅の中で動く。
      const friction = -Math.log(Math.min(0.9999, Math.max(0.01, config.steerFriction))) * 60;
      const decay = Math.exp(-friction * dt);
      const acceleration = state.smoothInput * config.steerAccel;
      const oldVelocity = state.xVel;
      state.xVel = oldVelocity * decay + acceleration / friction * (1 - decay);
      state.xVel = Math.max(-config.steerMax, Math.min(config.steerMax, state.xVel));
      state.xOffset += (oldVelocity + state.xVel) * 0.5 * dt;
      const half = config.roadWidth / 2 - 0.55;
      const edge = half - config.edgeSoftZone;
      if (Math.abs(state.xOffset) > edge) {
        const side = Math.sign(state.xOffset);
        // 外へ進む分だけ弱める。手を離した後に内側へ引っぱり続けない。
        if (state.xVel * side > 0) {
          const outward = Math.max(0, state.xVel * side - (Math.abs(state.xOffset) - edge) * config.edgeSpring * dt);
          state.xVel = side * outward * Math.pow(config.edgeDamping, dt * 60);
        }
      }
      if (Math.abs(state.xOffset) > half) {
        state.xOffset = Math.sign(state.xOffset) * half;
        state.xVel = 0;
      }
    }
  }
  return { advance };
})();
