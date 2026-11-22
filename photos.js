export const PHOTO_MAX_LENGTH=80000;
export function validPhoto(data){return typeof data==='string'&&data.length<=PHOTO_MAX_LENGTH&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(data);}
// Detection runs locally on a small image; only the final JPEG is uploaded.
let classifierPromise;
async function detectFaces(img){
  const scale=Math.min(1,480/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx?.getImageData)return [];
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const {default:pico}=await import('./vendor/pico.js');
  if(!classifierPromise)classifierPromise=fetch('./vendor/facefinder',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Modelo indisponível');return r.arrayBuffer();}).then(b=>pico.unpack_cascade(new Int8Array(b))).catch(e=>{classifierPromise=null;throw e;});
  const classify=await classifierPromise,rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,pixels=new Uint8Array(canvas.width*canvas.height);
  for(let i=0;i<pixels.length;i++)pixels[i]=(rgba[i*4]*2+rgba[i*4+1]*7+rgba[i*4+2])/10;
  return pico.cluster_detections(pico.run_cascade({pixels,nrows:canvas.height,ncols:canvas.width,ldim:canvas.width},classify,{shiftfactor:.05,minsize:30,maxsize:Math.min(canvas.width,canvas.height),scalefactor:1.05}),.2).filter(f=>f[3]>20).map(f=>({x:(f[1]-f[2]/2)/scale,y:(f[0]-f[2]/2)/scale,width:f[2]/scale,height:f[2]/scale}));
}
export function photoCrop(width,height,faces=[]){
  const limit=Math.min(width,height);
  const face=faces.filter(f=>[f.x,f.y,f.width,f.height].every(Number.isFinite)&&f.width>0&&f.height>0&&f.x>=0&&f.y>=0&&f.x+f.width<=width&&f.y+f.height<=height).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  if(!face)return {x:(width-limit)/2,y:(height-limit)/2,side:limit};
  const side=Math.min(limit,Math.max(face.width,face.height)*2.2);
  return {x:Math.max(0,Math.min(width-side,face.x+face.width/2-side/2)),y:Math.max(0,Math.min(height-side,face.y+face.height/2-side/2)),side};
}
export function preparePhoto(file,{detect=detectFaces}={}){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))return Promise.reject(Error('Escolha uma foto JPG, PNG ou WebP.'));
  if(file.size>15*1024*1024)return Promise.reject(Error('Escolha uma foto de até 15 MB.'));
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();let finished=false;
    const finish=(error,data)=>{if(finished)return;finished=true;clearTimeout(timer);URL.revokeObjectURL(url);img.onload=null;img.onerror=null;error?reject(error):resolve(data);};
    const timer=setTimeout(()=>finish(Error('A foto demorou para abrir. Escolha outra imagem.')),15000);
    img.onerror=()=>finish(Error('Não foi possível abrir essa foto. Tente outra imagem.'));
    img.onload=async()=>{try{
      if(!img.naturalWidth||!img.naturalHeight)throw Error('A foto está vazia.');
      let faces=[];try{faces=await detect(img);}catch{}
      if(finished)return;
      const {x,y,side}=photoCrop(img.naturalWidth,img.naturalHeight,faces),canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a foto neste aparelho.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);ctx.drawImage(img,x,y,side,side,0,0,256,256);
      let data;for(const quality of [.82,.7,.55,.4]){data=canvas.toDataURL('image/jpeg',quality);if(validPhoto(data)){finish(null,data);return;}}
      throw Error('Não foi possível reduzir essa foto. Tente outra imagem.');
    }catch(error){finish(error);}};
    img.src=url;
  });
}
