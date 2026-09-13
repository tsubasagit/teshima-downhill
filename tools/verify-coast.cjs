// GPU regression: compare coast visibility against a higher-precision depth reference.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:700}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8940');
    await page.waitForFunction(()=>typeof startReady!=='undefined'&&startReady&&texPending===0);
    await page.locator('#startBtn').click();await page.waitForTimeout(1400);
    const result=await page.evaluate(()=>{
      state.paused=true;scene.updateMatrixWorld(true);
      const isolated=new THREE.Scene();
      const landMaterial=new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide});
      const seaMaterial=new THREE.MeshBasicMaterial({color:0x0000ff});
      const islands=[];
      worldGroup.traverse(object=>{if(object.isMesh&&object.name.startsWith('panorama-island-'))islands.push(object);});
      const sea=worldGroup.getObjectByName('ocean-surface');
      for(const object of [...islands,sea]){
        const mesh=new THREE.Mesh(object.geometry,object===sea?seaMaterial:landMaterial);
        mesh.matrix.copy(object.matrixWorld);mesh.matrixAutoUpdate=false;isolated.add(mesh);
      }
      const offsetBefore=sea.material.map.offset.clone();
      const matricesBefore=islands.map(island=>island.matrixWorld.toArray());
      updateSceneryMotion(20,0.5);scene.updateMatrixWorld(true);
      const fixedTexture=offsetBefore.equals(sea.material.map.offset);
      const fixedLand=islands.every((island,index)=>island.matrixWorld.toArray().every((value,i)=>value===matricesBefore[index][i]));
      const cam=camera.clone();
      const target=new THREE.WebGLRenderTarget(550,350,{depthTexture:new THREE.DepthTexture(550,350,THREE.UnsignedIntType)});
      const clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
      renderer.setClearColor(0,0);renderer.setRenderTarget(target);
      const render=near=>{
        cam.near=near;cam.updateProjectionMatrix();renderer.render(isolated,cam);
        const pixels=new Uint8Array(550*350*4);renderer.readRenderTargetPixels(target,0,0,550,350,pixels);return pixels;
      };
      const measurements=[];
      for(const aspect of [1100/700,390/844]){
        cam.aspect=aspect;
        for(let frame=0;frame<16;frame++){
          cam.position.x=camera.position.x+Math.sin(frame)*0.03;
          const actual=render(camera.near),reference=render(5);let land=0,mismatch=0;
          for(let i=0;i<actual.length;i+=4){
            const expected=reference[i]>128;if(expected)land++;
            if((actual[i]>128)!==expected)mismatch++;
          }
          measurements.push({land,mismatch});
        }
      }
      renderer.setRenderTarget(null);renderer.setClearColor(clearColor,clearAlpha);
      target.dispose();landMaterial.dispose();seaMaterial.dispose();
      return {measurements,fixedTexture,fixedLand,islandCount:islands.length,bank:state.cameraBank};
    });
    console.log({maxMismatchedPixels:Math.max(...result.measurements.map(s=>s.mismatch)),maxMismatchRatio:Math.max(...result.measurements.map(s=>s.mismatch/s.land))});
    assert.equal(result.islandCount,8);assert.equal(result.fixedTexture,true);assert.equal(result.fixedLand,true);assert.equal(result.bank,0);
    for(const sample of result.measurements){
      assert.ok(sample.land>1000,'test must actually see the coastline');
      assert.ok(sample.mismatch<=Math.max(12,sample.land*0.001),`unstable coast: ${JSON.stringify(sample)}`);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: stable coastline at 32 desktop/mobile viewpoints; fixed water texture, terrain and level horizon.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
