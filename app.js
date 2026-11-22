import {videosShell,mountVideos,videoWeek} from './videos.js';
import {FutgordoAPI} from './api.js';
import {preparePhoto,validPhoto} from './photos.js';
import {enable as enablePush,disable as disablePush,deviceEnabled,deviceTested,rememberTest} from './notifications.js';
const api=new FutgordoAPI();
let guestAccessExpiry=null,knownPlayers=[];
let accessRows=[],accessError='',accessTrackedUser=null,accessTrackedAt=0;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const PIX='ericallanqueiroz@hotmail.com',GROUP='https://chat.whatsapp.com/Es4OylvI7Ua8ABRGx0bgwj';
const GAME_TIME='9h30 às 11h',GAME_ADDRESS='Rua Fábio José Bezerra, 70 — Parque Boturussu, São Paulo/SP — CEP 03805-000';
const GAME_MAP='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(GAME_ADDRESS);
function gameLocation(){return `<p><strong>Horário:</strong> ${GAME_TIME} (Brasília)</p><p><strong>Endereço:</strong> ${esc(GAME_ADDRESS)}</p><a class="charge-link" href="${esc(GAME_MAP)}" target="_blank" rel="noopener noreferrer">Abrir endereço no mapa ↗</a>`;}
const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const part=t=>dateParts.find(p=>p.type===t).value;
const today=part('year')+'-'+part('month')+'-'+part('day'),month=today.slice(0,7);
const sunday=new Date(today+'T12:00:00Z');sunday.setUTCDate(sunday.getUTCDate()+(7-sunday.getUTCDay())%7);
const game=sunday.toISOString().slice(0,10),gameLabel=sunday.toLocaleDateString('pt-BR',{timeZone:'UTC'});
const lastSunday=new Date(today+'T12:00:00Z');lastSunday.setUTCDate(lastSunday.getUTCDate()-lastSunday.getUTCDay());
let selectedVoteGame=lastSunday.toISOString().slice(0,10);
const voteDeadline=date=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4);return d.toISOString().slice(0,10);};
const votingOpen=date=>date<=today&&today<=voteDeadline(date);
let user=null,admin=false,profile=null,players=[],attendance=[],votes=[],ledger=[],collaborations=[],playerPhotos=[];
let pushConfig={ready:false},pushEnabled=false,pushTested=false,pushNotice="";
let photoTarget=null,pendingPhoto=null,billingContacts=[],billingContactError="";
let billingGroup='mensalista',selectedGuestGame=game,selectedAttendanceGame=game;
let tab=location.hash==='#videos'?'Vídeos':'Início',selectedMonth=month,authMode='login',busy=false,lastSync=null,syncError='',refreshing=null,draw=null,sharedDraw=null;
try{draw=JSON.parse(localStorage.getItem('futgordo-draw-'+game));}catch{}
const guestInviteToken=new URLSearchParams(location.search).get('avulso');
let inviteStatus=guestInviteToken?'checking':'none',inviteError='',generatedInvite=null;
function voteIcon(category){
  const full=category==='Bola Cheia';
  return `<img class="vote-icon" src="./${full?'bola-cheia':'bola-murcha'}.jpg" width="60" height="76" alt="" aria-hidden="true" data-ball="${full?'full':'flat'}">`;
}
const TEAM_COLORS=['🔵 Azul','🔴 Vermelho','⚪ Branco','⚫ Preto','🟡 Amarelo'];
const isKeeper=p=>p?.position==='goleiro';
const fieldPlayers=()=>players.filter(p=>present(p.id)&&!isKeeper(p));
function shuffled(items){const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function makeDraw(roster,size){const ids=shuffled(roster),teams=[];while(ids.length>=size&&teams.length<5)teams.push(ids.splice(0,size));return {size,roster:roster.slice(),teams,reserves:ids,colors:shuffled(TEAM_COLORS).slice(0,teams.length),order:shuffled(teams.map((_,i)=>i))};}
function avatar(p,large=false,dataOverride=null){
  const parts=String(p?.name||'Jogador').trim().split(/\s+/),initials=(parts[0][0]||'J')+(parts.length>1?parts.at(-1)[0]:'');
  const data=dataOverride??playerPhotos.find(photo=>photo.player_id===p?.id)?.photo_data;
  return `<span class="player-avatar ${large?'avatar-large':''}" aria-hidden="true"><span>${esc(initials.toUpperCase())}</span>${validPhoto(data)?`<img data-avatar src="${esc(data)}" alt="" loading="lazy" decoding="async">`:''}</span>`;
}
function playerIdentity(p){return `<span class="player-identity">${avatar(p)}<span>${esc(p.name)}</span></span>`;}
const person=id=>knownPlayers.find(p=>p.id===id)?.name||'Jogador';
const presentOn=(id,date)=>attendance.some(a=>a.player_id===id&&a.game_date===date&&a.status==='presente');
const present=id=>presentOn(id,game);
const memberType=p=>p?.membership_type||'mensalista';
const isMonthly=id=>memberType(players.find(p=>p.id===id))==='mensalista';
const isCollaborator=id=>memberType(players.find(p=>p.id===id))==='colaborador';
const collaborationDone=(id,m)=>collaborations.some(c=>c.player_id===id&&c.month.slice(0,7)===m&&c.completed);
const isGuest=id=>memberType(players.find(p=>p.id===id))==='avulso';
const guestPaid=(id,date)=>ledger.filter(e=>e.kind==='receita'&&e.player_id===id&&e.game_date===date).reduce((n,e)=>n+Number(e.amount),0);
const guestPresent=(id,date)=>attendance.some(a=>a.player_id===id&&a.game_date===date&&a.status==='presente'&&(a.billing_type==='avulso'||(!a.billing_type&&isGuest(id))));
const guestDue=(id,date)=>guestPresent(id,date)?Math.max(0,20-guestPaid(id,date)):0;
const guestRoster=date=>players.filter(p=>isGuest(p.id)||attendance.some(a=>a.player_id===p.id&&a.game_date===date&&a.billing_type==='avulso')||guestPaid(p.id,date)>0);
const dateLabel=date=>date.split('-').reverse().join('/');
const validDate=date=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(date+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;};
const paid=(id,m)=>ledger.filter(e=>e.kind==='mensalidade'&&e.player_id===id&&e.month.slice(0,7)===m).reduce((n,e)=>n+Number(e.amount),0);
function toast(text){$('toast').textContent=text;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',6500);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copiado!');}catch{prompt('Copie o texto:',text);}}
function billingPhone(id){const phone=billingContacts.find(c=>c.player_id===id)?.phone;return typeof phone==='string'&&/^55[1-9][0-9]{9,10}$/.test(phone)?phone:'';}
function paymentText(id,m){return `Olá, ${person(id)}! ⚽ Mensalidade do Futgordo FC de ${m.split('-').reverse().join('/')}. Vencimento: dia 5. Valor pendente: ${money(Math.max(0,60-paid(id,m)))}. Pix: ${PIX}. Após pagar, envie o comprovante ao administrador para registrar a baixa. Obrigado!`;}
async function load(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{
    try{
      const u=await api.user();
      let access=null;
      try{access=await api.request('/rest/v1/rpc/guest_access_status',{method:'POST',token:await api.token(),body:{}});}
      catch(e){if(e.status!==404&&e.code!=='PGRST202')throw e;}
      guestAccessExpiry=access?.expires_at||null;
      if(access&&access.active!==true){
        try{await api.logout();}catch{}
        user=null;admin=false;profile=null;players=[];attendance=[];votes=[];ledger=[];playerPhotos=[];sharedDraw=null;draw=null;
        throw Error(access.expired?'Seu acesso temporário terminou. Fale com o administrador do Futgordo.':'Seu acesso ao time foi encerrado. Fale com o administrador.');
      }

      const [p,a,v,l,roles,c,d,photos]=await Promise.all([api.rows('players','order=name.asc,id.asc'),api.rows('attendance','order=game_date.desc,player_id.asc'),api.rows('votes','order=game_date.desc,voter_id.asc,category.asc'),api.rows('ledger','order=created_at.desc,id.asc'),api.rows('admins','user_id=eq.'+u.id+'&order=user_id.asc'),api.collaborations(),api.teamDraw(game),api.photos()]);
      if(p.find(row=>row.id===u.id)?.removed_at){try{await api.logout();}catch{}user=null;admin=false;profile=null;players=[];attendance=[];votes=[];ledger=[];throw Error('Seu cadastro foi excluído do time. Fale com um administrador.');}
      user=u;knownPlayers=p;players=p.filter(row=>!row.removed_at&&(!row.guest_access_expires_at||Date.parse(row.guest_access_expires_at)>Date.now()||row.id===u.id&&roles.some(a=>a.user_id===u.id)));attendance=a.filter(row=>players.some(p=>p.id===row.player_id));votes=v.filter(row=>players.some(p=>p.id===row.voter_id)&&players.some(p=>p.id===row.candidate_id));ledger=l;collaborations=c;playerPhotos=photos;sharedDraw=d?.payload||null;if(!draw&&sharedDraw)draw=sharedDraw;admin=roles.some(r=>r.user_id===u.id);profile=p.find(row=>row.id===u.id)||null;if(!lastSync)billingGroup=memberType(profile);lastSync=new Date();syncError='';
      try{pushConfig=await api.pushConfig();pushEnabled=await deviceEnabled(u.id);pushTested=await deviceTested(u.id);}catch{pushConfig={ready:false};pushEnabled=false;pushTested=false;}
      if(location.hostname==='futgordofc.pages.dev'){
        try{if(accessTrackedUser!==u.id||Date.now()-accessTrackedAt>300000){await api.request('/rest/v1/rpc/record_new_app_access',{method:'POST',token:await api.token(),body:{}});accessTrackedUser=u.id;accessTrackedAt=Date.now();}}catch{}
      }
      accessRows=[];accessError='';
      if(admin){try{accessRows=await api.rows('temporary_app_access');}catch{accessError='A lista temporária precisa ser ativada no Supabase.';}}
      billingContacts=[];billingContactError='';if(admin){try{billingContacts=await api.billingContacts();}catch(e){billingContactError=e.message;}}
    }catch(e){syncError=e.message;if(!api.session||e.status===401){user=null;profile=null;admin=false;players=[];attendance=[];votes=[];ledger=[];}throw e;}
    finally{refreshing=null;}
  })();return refreshing;
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){toast(e.message);}finally{busy=false;render();}}
function options(list=players){return list.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');}
function render(){
  $('connection').textContent=user?(syncError?'Não foi possível atualizar: '+syncError:'Conectado • '+(lastSync?'atualizado às '+lastSync.toLocaleTimeString('pt-BR'):'carregando…')):'Entre na sua conta para acessar os dados do time.';
  $('nav').innerHTML='';
  if(!user){
    if(guestInviteToken&&inviteStatus!=='valid'){
      $('view').innerHTML=`<section><h2>Convite de avulso</h2><p>${inviteStatus==='checking'?'Conferindo a validade do convite…':esc(inviteError)}</p>${inviteStatus==='error'?'<button id="retry-invite">Tentar novamente</button>':''}</section>`;
      if($('retry-invite'))$('retry-invite').onclick=()=>{inviteStatus='checking';render();checkInvitation();};return;
    }
    $('view').innerHTML=`<section><h2>${authMode==='signup'?(guestInviteToken?'Cadastro temporário — R$ 20 por jogo':'Entre para o Futgordo'):'Bem-vindo ao Futgordo FC'}</h2><p>${authMode==='signup'?(guestInviteToken?'Cadastre seu nome, celular e senha. Seu acesso termina junto com a validade do convite.':'Cadastre seu nome, celular com DDD e uma senha individual.'):'Jogadores entram com celular e senha. Administradores já cadastrados podem usar o e-mail.'}</p><form id="auth-form" class="account-form">${authMode==='signup'?'<label>Seu nome<input name="name" autocomplete="name" minlength="2" maxlength="100" required></label>':''}<label>${authMode==='signup'?'Celular com DDD':'Celular ou e-mail'}<input name="identifier" type="text" inputmode="${authMode==='signup'?'tel':'text'}" autocomplete="username" required placeholder="${authMode==='signup'?'(11) 99999-9999':'Celular com DDD ou e-mail'}"></label><label>Senha<input name="password" type="password" autocomplete="${authMode==='signup'?'new-password':'current-password'}" ${authMode==='signup'?'minlength="12"':''} required></label>${authMode==='signup'?'<label>Confirme a senha<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label>':''}<button>${authMode==='signup'?'Criar minha conta':'Entrar'}</button></form><p id="auth-error" role="alert"></p><p><button id="auth-switch">${authMode==='signup'?'Já tenho conta':'Criar conta de jogador'}</button></p><p class="muted">O celular identifica o cadastro; não enviamos SMS nem mensagens automáticas. Use uma senha exclusiva.</p><p class="muted">Esqueceu a senha? Fale com o administrador do time. Administradores com e-mail podem solicitar a recuperação no Supabase.</p></section>`;
    $('auth-switch').onclick=()=>{authMode=authMode==='login'?'signup':'login';render();};
    $('auth-form').onsubmit=async e=>{e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);const password=data.get('password');if(authMode==='signup'&&password!==data.get('confirm'))return $('auth-error').textContent='As senhas não coincidem.';const mode=authMode;busy=true;const button=e.currentTarget.querySelector('button');button.disabled=true;$('auth-error').textContent='Conectando…';try{if(mode==='signup'){const name=data.get('name').trim();if(name.length<2)throw Error('Informe seu nome.');await api.signup(name,data.get('identifier'),password,guestInviteToken);}else await api.login(data.get('identifier'),password);await load();if(!profile&&mode==='signup'){await api.write('players',{id:user.id,name:data.get('name').trim()},{conflict:'id'});await load();}render();}catch(error){if($('auth-error'))$('auth-error').textContent=error.message;else toast(error.message);}finally{busy=false;if(button)button.disabled=false;}};
    return;
  }
  if(!admin)billingContacts=[];
  if(!admin&&['Fotos','Caixa','Cobranças','Admin'].includes(tab))tab='Início';
  $('nav').innerHTML=['Início',...(admin?['Fotos']:[]),'Jogo','Vídeos','Sortear times','Votação','Mensalistas',...(admin?['Cobranças','Caixa','Admin']:[])].map(t=>`<button data-tab="${t}" class="${tab===t?'active':''}">${t==='Mensalistas'?'Mensalistas e Avulsos':t}</button>`).join('');
  let html=`<div class="account-bar"><div class="account-profile">${avatar(profile||{name:user.user_metadata?.name||'Minha conta'})}<div class="account-name"><strong>${esc(profile?.name||user.user_metadata?.name||'Minha conta')}</strong>${profile&&tab==='Início'?'<button id="edit-name-toggle" type="button" aria-label="Editar meu nome" aria-expanded="false" aria-controls="edit-name-panel" style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;padding:8px;border:0;background:transparent;vertical-align:middle;color:inherit"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></svg></button>':''}${admin?'<small>Administrador</small>':''}</div></div><div class="account-actions"><button id="refresh">Atualizar</button><button id="signout">Sair da conta</button></div></div>`;
  if(admin||(!guestAccessExpiry&&!isGuest(user.id)&&isMonthly(user.id)))html+=`<p><a class="charge-link" href="${GROUP}" target="_blank" rel="noopener noreferrer">Grupo do Futgordo no WhatsApp ↗</a></p>`;
  if(admin&&tab==='Início')html+=`<section><details><summary>Acessos ao novo app — temporário</summary><p>Mostra acessos com a conta conectada após ativar esta lista. Não confirma instalação. Último acesso em horário de Brasília.</p>${accessError?`<p role="status">${esc(accessError)}</p>`:`<p>${players.filter(p=>accessRows.some(a=>a.player_id===p.id)).length} de ${players.length} jogadores já acessaram.</p>${players.map(p=>{const row=accessRows.find(a=>a.player_id===p.id);return `<div class="row"><span>${esc(p.name)}</span><span>${row?'Acessou • '+esc(new Date(row.last_seen_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})):'Ainda não registrado'}</span></div>`;}).join('')}`}</details></section>`;
  if(profile&&tab==='Início')html+=`<section id="edit-name-panel" hidden><form id="edit-name-form" class="account-form"><label>Meu nome<input name="name" autocomplete="name" minlength="2" maxlength="100" value="${esc(profile.name)}" required></label><button>Salvar nome</button><button type="button" id="edit-name-cancel">Cancelar</button><p role="status"></p></form></section>`;
  if(!profile){
    html+=`<section><h2>Complete seu perfil</h2><p>Seu acesso foi confirmado. Informe seu nome para entrar na lista do time.</p><form id="profile-form"><label>Seu nome<input name="name" value="${esc(user.user_metadata?.name||'')}" minlength="2" maxlength="100" required autocomplete="name"></label><button>Salvar meu nome</button></form></section>`;
  }else{
    const due=isMonthly(user.id)?Math.max(0,60-paid(user.id,month)):0;
    if(Number(today.slice(-2))>=5&&due>0)html+=`<aside><strong>Mensalidade pendente • ${money(due)}</strong><p>${esc(profile.name)}, sua mensalidade de ${month.split('-').reverse().join('/')} venceu no dia 5. O aviso sai após o administrador registrar o pagamento completo.</p><button data-copy-pix>Copiar Pix</button></aside>`;
    if(isGuest(user.id)&&guestDue(user.id,game)>0)html+=`<aside><strong>Avulso pendente • ${money(guestDue(user.id,game))}</strong><p>Jogo de ${gameLabel} • R$ 20 por jogo. Após pagar, envie o comprovante ao ADM.</p><button data-copy-pix>Copiar Pix</button></aside>`;
    if(tab==='Início'&&guestAccessExpiry&&!admin)html+=`<aside><strong>Acesso temporário</strong><p>Seu acesso termina em ${esc(new Date(guestAccessExpiry).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))} (Brasília), junto com o convite.</p></aside>`;
    if(tab==='Início')html+=`<section><small>O NOSSO TIME, ORGANIZADO</small><h2>Resenha em dia.<br>Futebol também.</h2><p>Confirme presença, vote nos destaques e acompanhe o caixa do time.</p><button data-tab="Jogo">Confirmar presença →</button></section><div class="grid"><section><h3>Próximo futebol</h3><div class="stat">Domingo</div><p>${gameLabel}</p>${gameLocation()}</section><section><h3>${isCollaborator(user.id)?'Colaborador — Coletes':isGuest(user.id)?'Avulso':'Mensalidade'}</h3><div class="stat">${isCollaborator(user.id)?'Lavagem':isGuest(user.id)?'R$ 20':'R$ 60'}</div><p>${isCollaborator(user.id)?'Sem mensalidade. '+(collaborationDone(user.id,month)?'Mês cumprido.':'Lavagem do mês aguardando confirmação do ADM.'):isGuest(user.id)?'Por jogo, sem mensalidade.':'Vencimento todo dia 5.'}</p><button data-copy-pix>Copiar chave Pix</button></section></div><section><h3>Convide um jogador</h3><p>Compartilhe o link. Cada jogador cria uma conta com seu próprio celular e senha.</p><button id="invite">Copiar link de cadastro</button></section>${admin?`<section><h3>Convidar avulso</h3><p>Gere um link válido por 6 dias para avulsos de R$ 20 por jogo. O acesso dos novos convidados termina na mesma data e horário do link, mesmo se cadastrando no último dia.</p><button id="guest-invite">Gerar link de avulso — 6 dias</button>${generatedInvite?`<label>Link do convite<input readonly value="${esc(generatedInvite.url)}"></label><p>Válido até ${esc(new Date(generatedInvite.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))} (Brasília).</p><button id="copy-guest-invite">Copiar convite de avulso</button>`:''}</section>`:''}`;
    if(tab==='Início')html+=`<section><h3>Notificações no celular</h3><p>Lembretes nos dias 5 e 10, às 10h de Brasília, somente enquanto houver mensalidade pendente.</p>${!pushConfig.ready?`<p>Serviço aguardando ativação pelo ADM.</p>${admin?'<button id="push-setup">Concluir configuração das notificações</button>':''}`:`<p>${pushEnabled?'Notificações ativadas neste aparelho.':'Ative para receber os avisos com o app fechado.'}</p><button id="push-enable">${pushEnabled?'Reativar neste celular':'Ativar notificações'}</button> ${pushTested?'':'<button id="push-test">Testar neste celular</button>'} <button id="push-disable">Desativar neste celular</button>`}<p class="muted">No iPhone, instale o app na Tela de Início e abra pelo ícone para autorizar. O celular precisa de internet; a entrega depende das configurações do aparelho.</p>${pushNotice?`<p role="status">${esc(pushNotice)}</p>`:''}</section>`;
    if(tab==='Vídeos')html+=`<div id="videos-panel">${videosShell(admin)}</div>`;
    if(tab==='Fotos'&&admin){
      if(!players.some(p=>p.id===photoTarget))photoTarget=user.id;
      const target=players.find(p=>p.id===photoTarget)||profile,hasSaved=playerPhotos.some(p=>p.player_id===target.id),preview=pendingPhoto?.id===target.id?pendingPhoto.data:null;
      html+=`<section><h2>${admin?'Fotos dos jogadores':'Minha foto'}</h2><p>${admin?'Escolha o jogador e confira o nome antes de salvar a foto.':'Coloque uma foto em que seu rosto apareça bem.'} A foto será mostrada aos membros do time. O app reduz a imagem para manter o carregamento leve.</p>${admin?`<label>Jogador<select id="photo-target">${players.map(p=>`<option value="${esc(p.id)}" ${p.id===target.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:''}<div class="photo-preview">${avatar(target,true,preview)}<strong>${esc(target.name)}</strong></div><form id="photo-form"><label>Escolher foto<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted">JPG, PNG ou WebP, até 15 MB. O app procura o rosto e centraliza a foto automaticamente. Use uma foto individual e confira a prévia; se não encontrar o rosto, o recorte fica no centro da imagem.</p><button ${preview?'':'disabled'}>Salvar foto</button></form>${preview?'<p class="muted">Prévia pronta. Toque em Salvar foto para compartilhar com o time.</p>':''}${hasSaved?'<button id="remove-photo">Remover foto</button>':''}</section>`;
    }
    if(tab==='Jogo'){
      const date=admin?selectedAttendanceGame:game;
      const gameDates=[...new Set([game,lastSunday.toISOString().slice(0,10),...attendance.map(a=>a.game_date)])].sort().reverse();
      html+=`<section><h2>Quem vai para o jogo?</h2>${admin?`<label>Jogo<select id="attendance-game">${gameDates.map(d=>`<option value="${d}" ${d===date?'selected':''}>${dateLabel(d)}</option>`).join('')}</select></label>`:`<p>Domingo, ${gameLabel}</p>`}${date===game?gameLocation():''}<p>Sua resposta: <strong>${esc(attendance.find(a=>a.player_id===user.id&&a.game_date===date)?.status||'Sem resposta')}</strong></p>${date===game?'<button data-att="presente">✓ Estou presente</button> <button data-att="ausente">Não vou</button>':'<p>Consulta de um jogo anterior. O ADM pode corrigir quem não compareceu.</p>'}<h3>Lista do jogo • ${players.filter(p=>presentOn(p.id,date)).length} presentes</h3>${players.map(p=>`<div class="row">${playerIdentity(p)}<span>${esc(attendance.find(a=>a.player_id===p.id&&a.game_date===date)?.status||'Sem resposta')}</span>${admin&&presentOn(p.id,date)?`<button id="mark-absent-${esc(p.id)}" data-mark-absent="${esc(p.id)}">Retirar dos presentes</button>`:''}</div>`).join('')}<p class="muted">Retirar dos presentes marca a pessoa como ausente somente no jogo escolhido, mantendo o cadastro e os pagamentos.</p></section>`;
    }
    if(tab==='Sortear times'){
      const result=admin?draw:sharedDraw;const eligible=fieldPlayers(),keepers=players.filter(p=>present(p.id)&&isKeeper(p));const valid=result&&Array.isArray(result.colors)&&Array.isArray(result.order)&&Array.isArray(result.teams);const stale=valid&&result.roster.slice().sort().join(',')!==eligible.map(p=>p.id).sort().join(',');
      html+=`<section><h2>⚽ Sortear times</h2><p>${eligible.length} jogadores de linha e ${keepers.length} goleiros presentes.</p>${admin?`<form id="draw"><label>Jogadores de linha por time<input name="size" type="number" min="1" max="50" value="${draw?.size||5}" required></label><button>Sortear times</button></form>`:'<p>Somente administradores podem realizar o sorteio.</p>'}<p class="muted">São necessários dois times completos de jogadores de linha. Os goleiros ficam fixos no gol e não ocupam vagas de linha. Até cinco times; quem sobrar fica na reserva. O ADM prepara o sorteio e toca em Publicar times para o grupo. Todos os jogadores cadastrados podem consultar o resultado publicado aqui.</p></section>`;
      html+=`<section><h3>🧤 Goleiros fixos no gol</h3>${keepers.map(p=>`<p>${playerIdentity(p)}</p>`).join('')||'<p>Nenhum goleiro confirmou presença.</p>'}<p>Ficam separados dos times e das reservas de linha.</p></section>`;
      if(admin)html+=`<section><h3>Definir posição do jogador</h3><form id="position-form"><label>Jogador<select name="player" required><option value="">Escolha uma pessoa cadastrada</option>${options()}</select></label><label>Posição<select name="position"><option value="goleiro">Goleiro fixo no gol</option><option value="linha">Jogador de linha</option></select></label><button>Salvar posição</button></form><p>${players.filter(isKeeper).map(p=>esc(p.name)).join(', ')||'Nenhum goleiro cadastrado.'}</p></section>`;
      if(!valid)html+='<aside>'+ (admin?'Faça um sorteio para definir os times.':'O ADM ainda não publicou os times deste jogo.')+'</aside>';if(stale)html+='<aside>A lista de jogadores de linha mudou após este sorteio. O ADM precisa revisar. Faça um novo sorteio e publique a nova definição.</aside>';if(admin&&valid)html+=`<section><button id="publish-draw" ${stale?'disabled':''}>Publicar times para o grupo</button><p>Publicar substitui a definição anterior para este jogo. Um novo sorteio só aparece aos jogadores depois de publicado.</p></section>`;
      if(valid&&(!admin||!stale))html+=`<section><h3>Começam jogando</h3><p><strong>${esc(result.colors[result.order[0]])} × ${esc(result.colors[result.order[1]])}</strong></p><h3>Próximos a entrar</h3>${result.order.slice(2).map((team,i)=>`<p>${i+1}º — ${esc(result.colors[team])}</p>`).join('')||'<p>Não há outros times na fila.</p>'}</section><div class="grid">${result.teams.map((team,i)=>`<section><h3>${esc(result.colors[i])}</h3>${team.map(id=>`<div class="row">${playerIdentity(players.find(p=>p.id===id)||{id,name:person(id)})}</div>`).join('')}</section>`).join('')}</div><section><h3>Reservas</h3>${result.reserves.map(id=>`<p>${playerIdentity(players.find(p=>p.id===id)||{id,name:person(id)})}</p>`).join('')||'<p>Todos foram distribuídos.</p>'}</section>`;
    }
    if(tab==='Votação'){
      const eligible=players.filter(p=>presentOn(p.id,selectedVoteGame)),roundVotes=votes.filter(v=>v.game_date===selectedVoteGame),open=votingOpen(selectedVoteGame);
      const rankings=Object.fromEntries(['Bola Cheia','Bola Murcha'].map(cat=>[cat,eligible.map(p=>({player:p,count:roundVotes.filter(v=>v.category===cat&&v.candidate_id===p.id&&presentOn(v.voter_id,selectedVoteGame)).length})).sort((a,b)=>b.count-a.count||a.player.name.localeCompare(b.player.name,'pt-BR'))]));
      const resultsSummary=!open?`<div class="round-results"><h3>Resultado final da rodada</h3><div class="grid">${['Bola Cheia','Bola Murcha'].map(cat=>{
        const ranking=rankings[cat],top=ranking[0]?.count||0,leaders=ranking.filter(r=>r.count===top);
        return `<article class="winner-card ${cat==='Bola Cheia'?'winner-full':'winner-flat'}"><h3>${voteIcon(cat)} ${cat}</h3>${top>0?`${leaders.length>1?'<p class="winner-label">Empate na primeira colocação</p>':'<p class="winner-label">Mais votado</p>'}${leaders.map(r=>`<div class="winner-person">${avatar(r.player,true)}<p class="winner-name">${esc(r.player.name)}</p></div>`).join('')}<p class="winner-count">${top} ${top===1?'voto':'votos'}${leaders.length>1?' para cada jogador':''}</p>`:'<p>Nenhum voto válido nesta categoria.</p>'}</article>`;
      }).join('')}</div></div>`:'';
      const rounds=[...new Set([selectedVoteGame,lastSunday.toISOString().slice(0,10),...attendance.map(a=>a.game_date),...votes.map(v=>v.game_date)])].filter(d=>d<=today).sort().reverse();
      html+=`<section><h2>Os destaques da rodada</h2><label>Rodada<select id="vote-game">${rounds.map(d=>`<option value="${d}" ${d===selectedVoteGame?'selected':''}>Jogo de ${dateLabel(d)}</option>`).join('')}</select></label><p><strong>Jogo de ${dateLabel(selectedVoteGame)}</strong> • ${open?'Votação aberta':'Votação encerrada — somente consulta'}</p><p>Prazo para votar: quinta-feira, ${dateLabel(voteDeadline(selectedVoteGame))}, às 23h59 (horário de Brasília). Os resultados ficam disponíveis após o encerramento.</p>${resultsSummary}<p>Todos os jogadores presentes podem votar e receber votos. A participação na votação é opcional. Um voto por categoria. Confira antes de confirmar: depois de enviado, o voto não pode ser alterado. Não é permitido votar em si mesmo.</p>${open&&!presentOn(user.id,selectedVoteGame)?'<aside>Somente quem confirmou presença nesta rodada pode votar.</aside>':''}${['Bola Cheia','Bola Murcha'].map(cat=>{const chosen=roundVotes.find(v=>v.voter_id===user.id&&v.category===cat)?.candidate_id;return `<h3>${voteIcon(cat)} ${cat}</h3><form id="vote-${cat==='Bola Cheia'?'cheia':'murcha'}" class="vote" data-category="${cat}"><select name="candidate" required ${!open||!presentOn(user.id,selectedVoteGame)||chosen?'disabled':''}><option value="">Escolha um jogador presente</option>${eligible.filter(p=>p.id!==user.id).map(p=>`<option value="${p.id}" ${p.id===chosen?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button ${!open||!presentOn(user.id,selectedVoteGame)||chosen?'disabled':''}>${chosen?'Voto confirmado':'Confirmar voto'}</button></form>${(open?eligible.map(p=>rankings[cat].find(r=>r.player.id===p.id)):rankings[cat]).map(r=>`<div class="row ${!open&&r.count>0&&r.count===rankings[cat][0]?.count?'vote-leader':''}"><span>${playerIdentity(r.player)}${!open&&r.count>0&&r.count===rankings[cat][0]?.count?'<small class="winner-label">Mais votado</small>':''}</span><b>${r.count} ${r.count===1?'voto':'votos'}</b></div>`).join('')}`;}).join('')}</section>`;
    }
    if(tab==='Mensalistas'){
      const roster=billingGroup==='avulso'?guestRoster(selectedGuestGame):billingGroup==='colaborador'?players.filter(p=>isCollaborator(p.id)||collaborationDone(p.id,selectedMonth)):players.filter(p=>isMonthly(p.id));
      html+=`<section><h2>Mensalistas, Avulsos e Colaboradores</h2><label>Visualizar<select id="billing-group"><option value="mensalista" ${billingGroup==='mensalista'?'selected':''}>Mensalistas — R$ 60 por mês</option><option value="avulso" ${billingGroup==='avulso'?'selected':''}>Avulsos — R$ 20 por jogo</option><option value="colaborador" ${billingGroup==='colaborador'?'selected':''}>Colaboradores — Lavagem dos coletes</option></select></label>${billingGroup==='avulso'?`<p>R$ 20 por jogo • sem mensalidade. Quem confirmar presença pode votar, se quiser.</p><label>Data do jogo<input id="guest-date" type="date" value="${selectedGuestGame}"></label>`:`<p>${billingGroup==='colaborador'?'Lavagem dos coletes • sem mensalidade. O ADM confirma individualmente o mês cumprido.':'R$ 60 por mês • vencimento dia 5'}</p><label>Mês<input id="month" type="month" value="${selectedMonth}"></label>`}${roster.map(p=>{
        if(billingGroup==='colaborador')return `<div class="row">${playerIdentity(p)}<span>${collaborationDone(p.id,selectedMonth)?'✓ Coletes entregues — mês cumprido':'Aguardando confirmação da lavagem'}</span>${admin?`<button id="collaboration-${esc(p.id)}" data-collaboration="${esc(p.id)}">${collaborationDone(p.id,selectedMonth)?'Desfazer confirmação':'Confirmar mês cumprido'}</button>`:''}</div>`;
        const amount=billingGroup==='avulso'?guestPaid(p.id,selectedGuestGame):paid(p.id,selectedMonth),fee=billingGroup==='avulso'?20:60;
        const expected=billingGroup!=='avulso'||guestPresent(p.id,selectedGuestGame);
        const status=amount>=fee?'✓ Pago':amount>0?'Parcial':expected?'Pendente':'Sem presença neste jogo';
        return `<div class="row">${playerIdentity(p)}<span>${status} • ${money(amount)}${billingGroup==='avulso'&&expected&&amount<20?`<br><small>Falta: ${money(20-amount)}</small>`:''}</span>${admin&&p.id!==user.id?`<button id="remove-member-${esc(p.id)}" data-remove-player="${esc(p.id)}" aria-label="Excluir ${esc(p.name)} do time">Excluir jogador</button>`:''}</div>`;
      }).join('')||'<p>Nenhum jogador nesta categoria.</p>'}<h3>Pagamento por Pix</h3><p>${PIX}</p><button data-copy-pix>Copiar chave Pix</button><p class="muted">Após copiar, abra seu banco, escolha Pix e cole a chave. Envie o comprovante ao administrador para registrar a baixa.</p></section>`;
      if(admin){
        html+=`<section><h3>Definir tipo do jogador</h3><p>A pessoa continua cadastrada no app. A classificação vale para os próximos jogos; os pagamentos anteriores ficam no caixa.</p><form id="membership-form"><label>Jogador<select name="player" required><option value="">Escolha uma pessoa cadastrada</option>${options()}</select></label><label>Tipo<select name="type"><option value="mensalista">Mensalista — R$ 60 por mês</option><option value="avulso">Avulso — R$ 20 por jogo</option><option value="colaborador">Colaborador — Lavagem dos coletes, sem mensalidade</option></select></label><button>Salvar tipo do jogador</button></form></section>`;
        if(billingGroup==='avulso')html+=`<section><h3>Registrar pagamento de avulso</h3><p>Registre somente valores recebidos. O lançamento vai para o caixa como receita de avulso, separado das mensalidades.</p><form id="guest-payment"><label>Jogador<select name="player" required><option value="">Escolha um avulso</option>${options(guestRoster(selectedGuestGame).filter(p=>guestPaid(p.id,selectedGuestGame)<20))}</select></label><label>Data do jogo<input name="date" type="date" value="${selectedGuestGame}" required></label><label>Valor recebido R$<input name="amount" type="number" min="0.01" max="20" step="0.01" value="20" required></label><button>Registrar pagamento do avulso</button></form></section>`;
      }
    }
    if(tab==='Cobranças'&&admin){const pending=players.filter(p=>isMonthly(p.id)&&paid(p.id,selectedMonth)<60);html+=`<section><h2>📲 Cobranças pelo WhatsApp</h2><label>Mês<input id="month" type="month" value="${selectedMonth}"></label><p>${pending.length} mensalista(s) com saldo pendente.</p>${billingContactError?`<p role="status" class="muted">${esc(billingContactError)}</p>`:''}<button id="group-bill">Copiar cobrança para o grupo</button><p><a class="charge-link" href="${GROUP}" target="_blank" rel="noopener noreferrer">Abrir grupo do Futgordo ↗</a></p>${pending.map(p=>`<div class="row"><span>${esc(p.name)}<br><small>Pendente: ${money(Math.max(0,60-paid(p.id,selectedMonth)))}</small></span><a class="charge-link" href="https://wa.me/${billingPhone(p.id)}?text=${encodeURIComponent(paymentText(p.id,selectedMonth))}" target="_blank" rel="noopener noreferrer">${billingPhone(p.id)?'Cobrar no contato ↗':'Escolher contato no WhatsApp ↗'}</a>${billingPhone(p.id)?'':'<small class="muted">Celular de cobrança indisponível para este jogador.</small>'}</div>`).join('')||'<p>Nenhuma cobrança pendente neste mês.</p>'}<p class="muted">O botão abre a conversa no celular cadastrado quando disponível. Confira o destinatário e toque em Enviar no WhatsApp. Nenhuma mensagem é enviada automaticamente.</p></section><section><h3>Alerta de mensalidade</h3><p>A partir do dia 5, o aviso aparece ao entrar no app enquanto a mensalidade estiver pendente. O pagamento registrado pelo administrador atualiza os aparelhos conectados.</p><p class="muted">Os avisos aparecem com o app aberto. Para receber com o app fechado, ative as notificações na aba Início. Os lembretes são nos dias 5 e 10, às 10h de Brasília, após o ADM concluir a configuração.</p></section>`;}
    if(tab==='Caixa'&&admin){
      const entries=ledger.filter(e=>e.month.slice(0,7)===selectedMonth),income=entries.filter(e=>e.kind!=='despesa').reduce((s,e)=>s+Number(e.amount),0),out=entries.filter(e=>e.kind==='despesa').reduce((s,e)=>s+Number(e.amount),0),balance=ledger.reduce((s,e)=>s+(e.kind==='despesa'?-1:1)*Number(e.amount),0);
      html+=`<section><h2>Caixa do time</h2><label>Mês<input id="month" type="month" value="${selectedMonth}"></label><div class="grid cash-totals"><div><small>Entradas no mês</small><div class="stat">${money(income)}</div></div><div><small>Despesas no mês</small><div class="stat">${money(out)}</div></div><div><small>Saldo acumulado</small><div class="stat">${money(balance)}</div></div></div></section><section><h3>Movimentações de ${selectedMonth.split('-').reverse().join('/')}</h3>${entries.map(e=>`<div class="row ledger-row"><span>${esc(e.kind==='mensalidade'?String(e.description||'').replace(/^Mensalidade\s*[—–-]\s*/i,''):e.description)}</span><b>${e.kind==='despesa'?'−':''}${money(e.amount)}</b></div>`).join('')||'<p>Nenhum lançamento neste mês.</p>'}</section>`;
    }
    if(tab==='Admin'&&admin)html+=`<section><h2>Administração</h2><p>Você está autorizado como administrador. Os lançamentos ficam no caixa compartilhado do time.</p><h3>Registrar mensalidade</h3><form id="payment"><label>Mensalista<select name="member" required><option value="">Escolha um mensalista</option>${options(players.filter(p=>isMonthly(p.id)))}</select></label><label>Mês<input type="month" name="month" value="${month}" required></label><label>Valor R$<input type="number" min="0.01" max="99999999" step="0.01" name="amount" value="60" required></label><button>Registrar pagamento</button></form><h3>Registrar despesa</h3><form id="expense"><label>Descrição<input name="description" placeholder="Ex.: aluguel do campo" maxlength="100" required></label><label>Mês<input type="month" name="month" value="${month}" required></label><label>Valor R$<input name="amount" type="number" min="0.01" max="99999999" step="0.01" required></label><button>Registrar despesa</button></form><h3>Administradores do time</h3><p>Escolha uma pessoa já cadastrada para autorizar o acesso ao Caixa, às cobranças e aos lançamentos. Ela também poderá autorizar outros administradores.</p><form id="grant-admin"><label>Jogador<select name="player" required><option value="">Escolha uma pessoa</option>${options(players.filter(p=>p.id!==user.id))}</select></label><button>Colocar como ADM</button></form><h3>Excluir jogador</h3><p>Retira a pessoa das listas e bloqueia o acesso dela ao time. O histórico do caixa é preservado. Administradores não podem ser excluídos por este comando.</p><form id="remove-player"><label>Jogador<select name="player" required><option value="">Escolha quem deseja excluir</option>${options(players.filter(p=>p.id!==user.id))}</select></label><button>Excluir jogador</button></form></section>`;
  }
  const oldVideos=$('videos-panel'),keepVideos=tab==='Vídeos'&&oldVideos?.dataset.owner===user.id+':'+admin&&oldVideos?.dataset.week===videoWeek().date;
  if(user&&tab==='Início')html+="<section><details><summary>Redefinir minha senha</summary><p>Troque a senha da sua pr\u00f3pria conta do Futgordo. Use pelo menos 12 caracteres.</p><form id=\"change-password-form\" class=\"account-form\"><label>Senha atual<input name=\"current\" type=\"password\" autocomplete=\"current-password\" required></label><label>Nova senha<input name=\"password\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\" required></label><label>Confirme a nova senha<input name=\"confirm\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\" required></label><button>Salvar nova senha</button><p id=\"change-password-status\" role=\"status\"></p></form></details></section>";
  if(!keepVideos)$('view').innerHTML=html;bind();
  if(tab==='Vídeos'&&!keepVideos){const panel=$('videos-panel');panel.dataset.owner=user.id+':'+admin;panel.dataset.week=videoWeek().date;mountVideos(panel,api,admin,(admin||isMonthly(user.id))?GROUP:null);}
}
function bind(){
  if($('edit-name-toggle'))$('edit-name-toggle').onclick=()=>{
    const panel=$('edit-name-panel'),button=$('edit-name-toggle');
    panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden){panel.querySelector('input').focus();panel.querySelector('input').select();}
  };
  if($('edit-name-cancel'))$('edit-name-cancel').onclick=()=>{$('edit-name-panel').hidden=true;$('edit-name-toggle').setAttribute('aria-expanded','false');$('edit-name-toggle').focus();};

  if($('edit-name-form'))$('edit-name-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const form=e.currentTarget,status=form.querySelector('[role="status"]'),button=form.querySelector('button');
    const name=String(new FormData(form).get('name')||'').trim().replace(/\s+/g,' ');
    if(name.length<2||name.length>100){status.textContent='Use um nome entre 2 e 100 caracteres.';return;}
    busy=true;button.disabled=true;status.textContent='Salvando…';
    try{await api.write('players',{id:user.id,name},{conflict:'id'});await load();render();toast('Nome atualizado.');}
    catch(error){status.textContent=error.message;}
    finally{busy=false;button.disabled=false;}
  };

  if($('change-password-form'))$('change-password-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const form=e.currentTarget,data=new FormData(form),status=form.querySelector('[role="status"]'),button=form.querySelector('button');
    if(data.get('password')!==data.get('confirm')){status.textContent='As novas senhas não coincidem.';return;}
    busy=true;button.disabled=true;status.textContent='Confirmando e salvando…';
    try{await api.changePassword(data.get('current'),data.get('password'));form.reset();status.textContent='Senha alterada. Na próxima entrada, use a nova senha.';}
    catch(error){form.reset();status.textContent=error.message;}
    finally{busy=false;button.disabled=false;data.delete('current');data.delete('password');data.delete('confirm');}
  };

  if($('push-setup'))$('push-setup').onclick=()=>{if(!admin)return;return action(async()=>{await api.pushService('setup');await load();pushNotice='Serviço configurado. Agora cada jogador deve ativar neste celular.';});};
  if($('push-enable'))$('push-enable').onclick=()=>action(async()=>{await enablePush(api,pushConfig,user.id);pushEnabled=true;pushTested=await deviceTested(user.id);pushNotice=pushTested?'Notificações ativadas neste celular.':'Ativado. Toque em Testar neste celular para conferir a entrega.';});
  if($('push-disable'))$('push-disable').onclick=()=>action(async()=>{await disablePush(api);pushEnabled=false;pushTested=false;pushNotice='Notificações desativadas neste celular.';});
  if($('push-test'))$('push-test').onclick=()=>action(async()=>{await api.pushService('test');pushTested=await rememberTest(user.id);pushNotice='Teste aceito pelo serviço de envio. Confira a notificação do celular.';});
  document.querySelectorAll('img[data-avatar]').forEach(img=>img.onerror=()=>img.remove());
  if($('photo-target'))$('photo-target').onchange=e=>{if(!admin||busy)return;photoTarget=e.target.value;pendingPhoto=null;render();};
  if($('photo-file'))$('photo-file').onchange=e=>{const file=e.target.files?.[0],id=photoTarget;if(!admin||!file||busy)return;return action(async()=>{if(!admin)throw Error('Somente ADM pode alterar fotos.');pendingPhoto={id,data:await preparePhoto(file)};toast('Confira a prévia e toque em Salvar foto.');});};
  if($('photo-form'))$('photo-form').onsubmit=e=>{e.preventDefault();const id=photoTarget;if(!admin||pendingPhoto?.id!==id||!validPhoto(pendingPhoto?.data))return toast('Escolha uma foto para este jogador.');const data=pendingPhoto.data;return action(async()=>{await api.setPhoto(id,data);pendingPhoto=null;await load();toast('Foto salva e compartilhada com o time.');});};
  if($('remove-photo'))$('remove-photo').onclick=()=>{const id=photoTarget;if(!admin)return;if(!confirm('Remover a foto de '+person(id)+'?'))return;return action(async()=>{await api.setPhoto(id,null);pendingPhoto=null;await load();toast('Foto removida.');});};

  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  document.querySelectorAll('[data-copy-pix]').forEach(b=>b.onclick=()=>copy(PIX));
  $('refresh').onclick=()=>action(async()=>{await load();toast('Dados atualizados.');});
  $('signout').onclick=()=>action(async()=>{try{try{await disablePush(api);}catch{}await api.logout();}finally{user=null;admin=false;profile=null;players=[];attendance=[];votes=[];ledger=[];pushEnabled=false;pushTested=false;pushNotice='';tab='Início';}});
  if($('billing-group'))$('billing-group').onchange=e=>{billingGroup=['avulso','colaborador'].includes(e.target.value)?e.target.value:'mensalista';render();};
  if($('guest-date'))$('guest-date').onchange=e=>{if(validDate(e.target.value))selectedGuestGame=e.target.value;render();};
  if($('publish-draw'))$('publish-draw').onclick=()=>{
    if(!admin)return toast('Somente administradores podem publicar os times.');
    if(!draw||draw.roster.slice().sort().join(',')!==fieldPlayers().map(p=>p.id).sort().join(','))return toast('Refaça o sorteio antes de publicar.');
    if(!confirm('Publicar estes times para todos os jogadores do app?'))return;
    return action(async()=>{await api.publishDraw(game,draw);await load();toast('Times publicados para os jogadores.');});
  };
  if($('position-form'))$('position-form').onsubmit=e=>{
    e.preventDefault();if(!admin)return toast('Somente administradores podem definir posições.');
    const data=new FormData(e.currentTarget),id=data.get('player'),position=data.get('position');
    if(!players.some(p=>p.id===id)||!['linha','goleiro'].includes(position))return toast('Escolha o jogador e a posição.');
    return action(async()=>{await api.setPosition(id,position);await load();toast('Posição salva. Refaça o sorteio se a lista de linha mudou.');});
  };
  if($('membership-form'))$('membership-form').onsubmit=e=>{
    e.preventDefault();if(!admin)return toast('Somente administradores podem definir o tipo do jogador.');
    const data=new FormData(e.currentTarget),id=data.get('player'),type=data.get('type');
    if(!players.some(p=>p.id===id)||!['mensalista','avulso','colaborador'].includes(type))return toast('Escolha o jogador e o tipo.');
    if(!confirm('Definir '+person(id)+' como '+(type==='colaborador'?'colaborador (lavagem dos coletes, sem mensalidade)':type==='avulso'?'avulso (R$ 20 por jogo)':'mensalista (R$ 60 por mês)')+'? Os pagamentos anteriores serão preservados.'))return;
    return action(async()=>{await api.setMembership(id,type);await load();billingGroup=type;toast('Tipo do jogador atualizado.');});
  };
  document.querySelectorAll('[data-collaboration]').forEach(b=>b.onclick=()=>{
    if(!admin)return toast('Somente administradores podem confirmar a lavagem.');
    const id=b.dataset.collaboration,completed=!collaborationDone(id,selectedMonth);
    if(!confirm((completed?'Confirmar mês cumprido de ':'Desfazer confirmação de ')+person(id)+' em '+selectedMonth+'?'))return;
    return action(async()=>{await api.setCollaboration(id,selectedMonth,completed);await load();toast('Registro da lavagem atualizado.');});
  });
  if($('guest-payment'))$('guest-payment').onsubmit=e=>{
    e.preventDefault();if(!admin)return toast('Somente administradores podem registrar pagamentos.');
    const data=new FormData(e.currentTarget),id=data.get('player'),date=data.get('date'),amount=Number(data.get('amount'));
    if(!validDate(date)||!guestRoster(date).some(p=>p.id===id)||!Number.isFinite(amount)||amount<=0||amount>20||Math.abs(amount*100-Math.round(amount*100))>0.00001)return toast('Confira o avulso, a data e o valor de até R$ 20,00.');
    if(guestPaid(id,date)+amount>20)return toast('O total recebido para este jogo ultrapassaria R$ 20,00. Confira o caixa.');
    const entryId=crypto.randomUUID();
    return action(async()=>{try{await api.payGuest(id,date,amount,entryId);}catch(error){try{await load();}catch{}throw Error(error.message+' Confira o caixa antes de repetir o lançamento.');}selectedGuestGame=date;await load();toast('Pagamento do avulso salvo no caixa.');});
  };
  if($('vote-game'))$('vote-game').onchange=e=>{const date=e.target.value;if(validDate(date)&&date<=today){selectedVoteGame=date;render();}};
  if($('month'))$('month').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))selectedMonth=e.target.value;render();};
  if($('profile-form'))$('profile-form').onsubmit=e=>{e.preventDefault();const name=new FormData(e.currentTarget).get('name').trim();if(name.length<2)return toast('Informe seu nome.');action(async()=>{await api.write('players',{id:user.id,name},{conflict:'id'});await load();toast('Perfil salvo.');});};
  const removeMember=id=>{
    if(!admin)return toast('Somente administradores podem excluir jogadores.');
    if(!id||id===user.id||!players.some(p=>p.id===id))return toast('Escolha outro jogador cadastrado.');
    const name=person(id);
    if(!confirm('Excluir '+name+' do time? A pessoa sairá das listas e perderá o acesso ao time. Os lançamentos do caixa serão preservados.'))return;
    return action(async()=>{await api.removePlayer(id);await load();toast(name+' foi excluído do time.');});
  };
  if($('remove-player'))$('remove-player').onsubmit=e=>{e.preventDefault();return removeMember(new FormData(e.currentTarget).get('player'));};
  document.querySelectorAll('[data-remove-player]').forEach(button=>button.onclick=()=>removeMember(button.dataset.removePlayer));
  if($('grant-admin'))$('grant-admin').onsubmit=e=>{
    e.preventDefault();if(!admin)return toast('Somente administradores podem autorizar outra conta.');
    const id=new FormData(e.currentTarget).get('player');
    if(!id||id===user.id||!players.some(p=>p.id===id))return toast('Escolha outra pessoa cadastrada.');
    if(!confirm('Colocar '+person(id)+' como ADM? Essa pessoa poderá consultar o Caixa, registrar pagamentos e despesas e autorizar outros administradores.'))return;
    action(async()=>{await api.grantAdmin(id);toast(person(id)+' está autorizado como ADM. Peça para atualizar o app.');});
  };
  if($('attendance-game'))$('attendance-game').onchange=e=>{if(admin&&validDate(e.target.value)){selectedAttendanceGame=e.target.value;render();}};
  document.querySelectorAll('[data-mark-absent]').forEach(b=>b.onclick=()=>{
    if(!admin)return toast('Somente administradores podem retirar jogadores dos presentes.');
    const id=b.dataset.markAbsent,date=selectedAttendanceGame;
    if(!presentOn(id,date))return toast('Atualize a lista de presentes.');
    if(!confirm('Marcar '+person(id)+' como ausente no jogo de '+dateLabel(date)+'? O cadastro e os pagamentos serão mantidos.'))return;
    return action(async()=>{await api.markAbsent(id,date);await load();toast('Jogador marcado como ausente neste jogo.');});
  });
  if($('guest-invite'))$('guest-invite').onclick=()=>{if(!admin)return;return action(async()=>{const invitation=await api.createGuestInvite();generatedInvite={...invitation,url:location.origin+'/?avulso='+encodeURIComponent(invitation.token)};toast('Convite criado. Toque em Copiar convite de avulso.');});};
  if($('copy-guest-invite'))$('copy-guest-invite').onclick=()=>copy(generatedInvite.url);
  if($('invite'))$('invite').onclick=()=>copy(location.origin+'/?cadastro=1');
  document.querySelectorAll('[data-att]').forEach(b=>b.onclick=()=>action(async()=>{await api.write('attendance',{game_date:game,player_id:user.id,status:b.dataset.att,updated_at:new Date().toISOString()},{conflict:'game_date,player_id'});await load();toast('Presença atualizada.');}));
  document.querySelectorAll('.vote').forEach(f=>f.onsubmit=e=>{
    e.preventDefault();const candidate=new FormData(f).get('candidate'),category=f.dataset.category;
    if(votes.some(v=>v.game_date===selectedVoteGame&&v.voter_id===user.id&&v.category===category))return toast('Seu voto nesta categoria já foi confirmado e não pode ser alterado.');
    if(!votingOpen(selectedVoteGame))return toast('A votação desta rodada está encerrada. O prazo termina na quinta-feira às 23h59.');
    if(!presentOn(user.id,selectedVoteGame)||!presentOn(candidate,selectedVoteGame)||candidate===user.id)return toast('Escolha outro jogador presente.');
    if(!confirm('Confirmar '+person(candidate)+' como '+category+'? Depois de enviado, o voto não poderá ser alterado.'))return;
    return action(async()=>{try{await api.write('votes',{game_date:selectedVoteGame,voter_id:user.id,category,candidate_id:candidate});}catch(error){try{await load();}catch{}throw Error(error.message+' Confira seu voto antes de tentar novamente.');}await load();toast('Voto confirmado.');});
  });
  if($('draw'))$('draw').onsubmit=e=>{e.preventDefault();if(!admin)return toast('Somente administradores podem sortear os times.');const size=Number(new FormData(e.currentTarget).get('size')),ids=fieldPlayers().map(p=>p.id);if(!Number.isInteger(size)||size<1||size>50)return toast('Escolha de 1 a 50 jogadores por time.');if(ids.length<size*2)return toast('São necessários pelo menos '+size*2+' jogadores de linha presentes.');draw=makeDraw(ids,size);try{localStorage.setItem('futgordo-draw-'+game,JSON.stringify(draw));}catch{toast('Sorteio exibido, mas não foi possível salvá-lo neste aparelho.');}render();};
  if($('group-bill'))$('group-bill').onclick=()=>copy(`⚽ FUTGORDO FC — MENSALIDADE\nReferência: ${selectedMonth.split('-').reverse().join('/')}\nValor: R$ 60,00 por mensalista\nVencimento: dia 5\nPix: ${PIX}\nQuem ainda não acertou, efetue o pagamento e envie o comprovante ao administrador. Se já pagou, desconsidere. Obrigado!`);
  for(const kind of ['payment','expense'])if($(kind))$(kind).onsubmit=e=>{
    e.preventDefault();if(!admin)return toast('Acesso restrito aos administradores autorizados.');const data=new FormData(e.currentTarget),amount=Number(data.get('amount')),m=data.get('month'),id=data.get('member');
    if(!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}$/.test(m))return toast('Confira o mês e o valor.');
    if(kind==='payment'&&(!players.some(p=>p.id===id)||!isMonthly(id)))return toast('Escolha um mensalista. Pagamentos de avulso ficam em Mensalistas e Avulsos.');
    const description=kind==='expense'?data.get('description').trim():'Mensalidade — '+person(id);if(!description)return toast('Informe a descrição.');
    const body={id:crypto.randomUUID(),month:m+'-01',kind:kind==='expense'?'despesa':'mensalidade',player_id:kind==='expense'?null:id,description,amount};
    action(async()=>{try{await api.write('ledger',body);}catch(error){try{await load();}catch{}throw Error(error.message+' Confira o caixa antes de repetir o lançamento.');}await load();toast('Lançamento salvo no caixa do time.');});
  };
}
if(new URLSearchParams(location.search).get('cadastro')==='1'||guestInviteToken)authMode='signup';
$('view').innerHTML='<section><p>Conectando à sua conta…</p></section>';
async function checkInvitation(){try{await api.checkGuestInvite(guestInviteToken);inviteStatus='valid';inviteError='';}catch(e){inviteStatus='error';inviteError=e.message;}render();}
async function start(){if(guestInviteToken)await checkInvitation();if(api.session){try{await load();}catch(e){toast(e.message);}}render();}
start();
function dateChanged(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>p.find(x=>x.type===t).value;return get('year')+'-'+get('month')+'-'+get('day')!==today;}
setInterval(async()=>{if(!document.hidden&&!busy&&dateChanged()){location.reload();return;}if(user&&!busy&&!document.hidden){try{await load();if(!document.querySelector('#view input:focus,#view select:focus'))render();}catch{render();}}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy&&dateChanged()){location.reload();return;}if(!document.hidden&&user&&!busy)load().then(()=>render()).catch(e=>toast(e.message));});
window.addEventListener('online',()=>{if(user&&!busy)load().then(()=>render()).catch(e=>toast(e.message));});
