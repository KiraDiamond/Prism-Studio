let libraryPromise;
const images = new Map();
function texture(source) {
  if (!images.has(source)) images.set(source,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=source;}));
  return images.get(source);
}
export async function drawHead(canvas, account) {
  const source=account?.skin;canvas.dataset.skin=source||'';
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#718299';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#24354e';ctx.fillRect(6,12,6,5);ctx.fillRect(21,12,6,5);
  if (!source)return;
  try {const img=await texture(source);if(canvas.dataset.skin!==source)return;
    const scale=img.width/64;ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,8*scale,8*scale,8*scale,8*scale,0,0,canvas.width,canvas.height);
    ctx.drawImage(img,40*scale,8*scale,8*scale,8*scale,0,0,canvas.width,canvas.height);
  } catch { /* Keep the neutral head when an optional texture cannot be decoded. */ }
}
function neutralSkin() {
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const c=canvas.getContext('2d');c.fillStyle='#7f91a9';c.fillRect(0,0,64,64);c.clearRect(32,0,32,16);c.clearRect(0,32,64,16);c.clearRect(0,48,16,16);c.clearRect(48,48,16,16);
  c.fillStyle='#3a5375';c.fillRect(20,20,8,12);c.fillStyle='#263951';c.fillRect(4,20,4,12);c.fillRect(20,52,4,12);return canvas;
}
export class SkinCarousel {
  constructor(stage) {this.stage=stage;this.entries=[];this.generation=0;this.disposed=false;}
  release(entry) {
    const viewer=entry.viewer;entry.viewer=null;
    if(viewer){viewer.dispose();viewer.renderer.forceContextLoss();}
    const canvas=document.createElement('canvas');entry.canvas.replaceWith(canvas);entry.canvas=canvas;
  }
  async setAccounts(accounts,onSelect) {
    this.dispose();this.disposed=false;
    this.entries=accounts.map(account=>{
      const button=document.createElement('button');button.className='skin-slot';button.setAttribute('aria-label',`Select ${account.name}`);button.style.opacity='0';
      const canvas=document.createElement('canvas');button.append(canvas);button.addEventListener('click',()=>onSelect(account.name));this.stage.append(button);
      return {account,button,canvas,viewer:null,visible:false};
    });
  }
  async select(name) {
    const generation=++this.generation;
    const active=this.entries.findIndex(e=>e.account.name===name),count=this.entries.length;if(active<0)return;
    const {SkinViewer}=await (libraryPromise??=import('./skinview.bundle.js'));
    if(this.disposed||generation!==this.generation)return;
    for(let index=0;index<count;index++) {
      const entry=this.entries[index];let delta=(index-active+count)%count;if(delta>count/2)delta-=count;
      const distance=Math.abs(delta),visible=distance<=2;
      entry.button.style.cssText=`--offset:${delta*195}px;--scale:${distance===0?1:distance===1?.8:.61};--opacity:${visible?(distance===0?1:distance===1?.75:.35):0};--brightness:${distance===0?1:distance===1?.83:.7};--layer:${5-distance};pointer-events:${visible?'auto':'none'}`;
      entry.button.setAttribute('aria-pressed',String(delta===0));entry.button.setAttribute('aria-hidden',String(!visible));entry.button.tabIndex=visible?0:-1;
      if(!visible){if(entry.viewer)this.release(entry);entry.visible=false;continue;}
      if(!entry.viewer) {
        try {
          const viewer=new SkinViewer({canvas:entry.canvas,width:270,height:410,pixelRatio:1,zoom:.85,fov:35,enableControls:false,renderPaused:true});
          entry.viewer=viewer;viewer.playerObject.rotation.y=delta===0?.2:delta<0?.38:-.38;
          viewer.globalLight.intensity=1.6;viewer.cameraLight.intensity=.6;
          Promise.resolve(viewer.loadSkin(entry.account.skin||neutralSkin(),{model:entry.account.model||'default'})).then(()=>{
            if(this.disposed||entry.viewer!==viewer)return;
            viewer.render();entry.canvas.dataset.loaded='true';
          }).catch(()=>{entry.canvas.dataset.loaded='error';});
        } catch {entry.button.innerHTML='<span class="skin-error">Skin unavailable</span>';}
      } else {entry.viewer.playerObject.rotation.y=delta===0?.2:delta<0?.38:-.38;entry.viewer.render();}
      entry.visible=true;
    }
  }
  dispose() {this.disposed=true;this.generation++;for(const e of this.entries){this.release(e);e.button.remove();}this.entries=[];}
}
