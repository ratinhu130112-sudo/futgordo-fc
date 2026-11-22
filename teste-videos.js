import {FutgordoAPI} from './api.js';
const api=new FutgordoAPI(),$=id=>document.getElementById(id);
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=t=>parts.find(p=>p.type===t).value;
const today=part('year')+'-'+part('month')+'-'+part('day'),d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());$('date').value=d.toISOString().slice(0,10);$('date').max=today;
function link(label,url){const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
$('search').onsubmit=async event=>{event.preventDefault();if(!$('search').reportValidity())return;const date=$('date').value;if(new Date(date+'T12:00:00Z').getUTCDay()!==0){$('status').textContent='Escolha um domingo.';return;}
 $('submit').disabled=true;$('results').replaceChildren();$('status').textContent='Consultando o GolZoom… Aguarde com esta página aberta.';
 try{const token=await api.token();await api.user();const payload={date,email:$('email').value.trim(),password:$('password').value};$('password').value='';
 const response=await fetch('/api/videos/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(180000)});payload.password='';
 const data=await response.json();if(!response.ok)throw Error(data.message||'A busca não foi concluída.');
 $('status').textContent=data.message+'\n'+data.clips.length+' vídeo(s) encontrado(s). Este resultado não foi publicado no app.';
 for(const c of data.clips){const url=new URL(c.url);if(url.origin!=='https://golzoom.com'||!/^\/uploads\/[a-zA-Z0-9]+\.mp4$/.test(url.pathname))continue;
 const section=document.createElement('section'),h=document.createElement('h2'),video=document.createElement('video');h.textContent='Lance das '+c.time;video.controls=true;video.playsInline=true;video.preload='none';video.src=url.href;
 section.append(h,video,link('Abrir ou baixar vídeo no GolZoom ↗',url.href));$('results').append(section);}
 }catch(e){$('status').textContent=e.name==='TimeoutError'?'O GolZoom demorou para responder. A busca parou sem salvar dados.':e.message;}finally{$('password').value='';$('submit').disabled=false;}
};

fetch('/api/videos/connection',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(!data.ready){$('status').textContent=data.message;$('submit').disabled=true;}}).catch(()=>{$('status').textContent='Não foi possível verificar a conexão. Atualize a página antes de testar.';$('submit').disabled=true;});
