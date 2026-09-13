const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({innerWidth: 1200});
vm.runInContext(fs.readFileSync(path.join(root,'settings.js'),'utf8') + '\n' +
  fs.readFileSync(path.join(root,'physics.js'),'utf8') + '\nglobalThis.api = {CONFIG, RidePhysics};', context);
const { CONFIG, RidePhysics } = context.api;
function state() { return { distance:0,totalLength:10000,currentSpeed:0,speedScale:1,xVel:0,xOffset:0,smoothInput:0 }; }
function run(s, input, seconds, fps=60, config=CONFIG) {
  for(let i=0;i<Math.round(seconds*fps);i++) RidePhysics.advance(s,input,config,1/fps);
  return s;
}
const straight = {steer:0,brake:false};
test('30/60/120fps produce the same travel and near-identical steering',()=>{
  const results=[30,60,120].map(fps=>{
    const s=state();run(s,{steer:1,brake:false},0.5,fps);
    run(s,{steer:-1,brake:false},0.5,fps);run(s,straight,1,fps);return s;
  });
  for(const s of results) { assert.ok(Math.abs(s.distance-results[0].distance)<1e-8);assert.ok(Math.abs(s.xOffset-results[0].xOffset)<0.01); }
});
test('speed setting changes steady travel and forward motion stays monotonic',()=>{
  const slow=run(state(),straight,10,60,{...CONFIG,speed:24});
  const fast=run(state(),straight,10,60,{...CONFIG,speed:48});
  assert.ok(Math.abs(fast.distance-2*slow.distance)<1e-8);
  assert.ok(slow.currentSpeed>23.9 && slow.distance>0);
});
test('brake slows to its target and release returns to cruising speed',()=>{
  const s=run(state(),straight,5);run(s,{steer:0,brake:true},5);
  assert.ok(Math.abs(s.currentSpeed-CONFIG.speed*CONFIG.brakeFactor)<0.01);
  run(s,straight,5);assert.ok(Math.abs(s.currentSpeed-CONFIG.speed)<0.01);
});
test('holding either direction cannot leave the road; release settles',()=>{
  for(const steer of [-1,1]) {
    const s=run(state(),{steer,brake:false},10);
    assert.ok(Math.abs(s.xOffset)<=CONFIG.roadWidth/2-0.55+1e-8);
    run(s,straight,4); assert.ok(Math.abs(s.xVel)<0.01);
    assert.ok(Number.isFinite(s.xOffset));
  }
});
test('distance clamps exactly at the harbor',()=>{
  const s=state();s.totalLength=20;run(s,straight,10);assert.equal(s.distance,20);
});
test('zero elapsed time leaves simulation unchanged',()=>{
  const s=state();const previous={...s};RidePhysics.advance(s,{steer:1,brake:true},CONFIG,0);assert.deepEqual(s,previous);
});
