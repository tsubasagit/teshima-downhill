// GPU regression: opacity must not dip while steering or returning to neutral.
const assert = require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:700}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8940');
    await page.waitForFunction(()=>typeof startReady!=='undefined'&&startReady&&texPending===0);
    const result=await page.evaluate(()=>{
      state.running=true;state.paused=true;
      const parent=player.parent,position=player.position.clone(),rotation=player.quaternion.clone();
      const testScene=new THREE.Scene();testScene.add(player);player.position.set(0,0,0);player.quaternion.identity();
      const cam=new THREE.OrthographicCamera(-1.6,1.6,3.2,-0.3,0.1,20);cam.position.z=5;
      const target=new THREE.WebGLRenderTarget(192,224);
      const pixels=new Uint8Array(192*224*4);
      const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
      renderer.setClearColor(0,0);renderer.setRenderTarget(target);
      const samples=[];let maxFootDisplacement=0,maxVertexStep=0;
      const mesh=player.userData.riderMesh,rest=mesh.userData.restPositions;
      let previous=mesh.geometry.attributes.position.array.slice();
      for(let frame=0;frame<240;frame++){
        const command=frame<30?0:frame<90?-1:frame<150?1:frame<180?0:(Math.floor(frame/5)%2?1:-1);
        state.visualSteer+=(command-state.visualSteer)*(1-Math.exp(-1/60/CONFIG.poseBlendTime));
        updateSpritePose(frame/60,1/60);
        renderer.render(testScene,cam);renderer.readRenderTargetPixels(target,0,0,192,224,pixels);
        let total=0;for(let i=3;i<pixels.length;i+=4)total+=pixels[i];samples.push(total);
        const current=mesh.geometry.attributes.position.array;
        for(let i=0;i<current.length;i+=3){
          if((rest[i+1]+1.425)/2.85<=0.18){
            for(let axis=0;axis<3;axis++)maxFootDisplacement=Math.max(maxFootDisplacement,Math.abs(current[i+axis]-rest[i+axis]));
          }
          for(let axis=0;axis<3;axis++)maxVertexStep=Math.max(maxVertexStep,Math.abs(current[i+axis]-previous[i+axis]));
        }
        previous=current.slice();
      }
      const frozen=mesh.geometry.attributes.position.array.slice();updateSpritePose(239/60,0);
      const frozenUnchanged=frozen.every((value,i)=>value===mesh.geometry.attributes.position.array[i]);
      const ratio=Math.min(...samples)/Math.max(...samples);
      renderer.setRenderTarget(null);renderer.setClearColor(color,alpha);target.dispose();
      parent.add(player);player.position.copy(position);player.quaternion.copy(rotation);
      return {ratio,minAlpha:Math.min(...samples),maxAlpha:Math.max(...samples),maxFootDisplacement,maxVertexStep,frozenUnchanged,meshCount:player.children.length,opacity:mesh.material.opacity};
    });
    console.log(result);
    assert.ok(result.ratio>0.97,'steering must retain at least 97% of rendered alpha coverage');
    assert.equal(result.meshCount,1);assert.equal(result.opacity,1);
    assert.equal(result.maxFootDisplacement,0);assert.ok(result.maxVertexStep<0.065);
    assert.equal(result.frozenUnchanged,true);assert.deepEqual(errors,[]);
    console.log('PASS: stable sprite alpha, continuous turns/reversals, fixed feet and frozen pause.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
