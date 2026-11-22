const ORIGIN='https://vvampzfgjoejnwwswwek.supabase.co';
const PUBLIC_KEY='sb_publishable_TVnds8HvdzfGGoIGNRRGGA_ZCd5FyOP';
const SESSION_KEY='futgordo-auth-v2';
export function normalizePhone(value){
  let n=String(value).replace(/\D/g,'');
  if(n.length===10||n.length===11)n='55'+n;
  if(!/^55[1-9][0-9]{9,10}$/.test(n))throw Error('Informe o celular com DDD, por exemplo (11) 99999-9999.');
  return n;
}
export function identityEmail(value){
  const v=String(value).trim().toLowerCase();
  return v.includes('@')?v:normalizePhone(v)+'@jogadores.futgordo.invalid';
}
function message(data,status){
  const code=data?.error_code||data?.code;
  if(code==='invalid_credentials')return 'Celular, e-mail ou senha incorretos.';
  if(code==='email_not_confirmed')return 'A conta ainda aguarda confirmação. Fale com o administrador.';
  if(code==='user_already_exists')return 'Este celular já tem cadastro. Use Entrar.';
  if(code==='23505')return 'Este registro já existe.';
  if(code==='42501')return 'Sua conta não tem permissão para essa ação. Atualize a tela ou fale com o administrador.';
  if(code==='23514')return 'Não foi possível registrar. Confira os dados e as regras desta ação.';
  if(status===429)return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.';
  return data?.msg||data?.message||data?.error_description||'Não foi possível concluir a operação.';
}
export class FutgordoAPI{
  constructor({storage=localStorage,fetcher=fetch}={}){
    this.storage=storage;this.fetcher=fetcher.bind(globalThis);this.session=null;this.refreshing=null;this.photoCache=new Map();
    try{this.session=JSON.parse(storage.getItem(SESSION_KEY));}catch{}
  }
  store(data){
    this.session=data?.access_token?{access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600),user:data.user}:null;
    if(this.session)this.storage.setItem(SESSION_KEY,JSON.stringify(this.session));else {this.storage.removeItem(SESSION_KEY);this.photoCache.clear();}
  }
  async request(path,{method='GET',body,token,headers={}}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await this.fetcher(ORIGIN+path,{method,signal:controller.signal,headers:{apikey:PUBLIC_KEY,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
      const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('Resposta inesperada do servidor. Tente atualizar a página.');}
      if(!r.ok){const e=Error(message(data,r.status));e.status=r.status;e.code=data?.code||data?.error_code;throw e;}return data;
    }catch(e){if(e.name==='AbortError')throw Error('A conexão demorou demais. Confira sua internet e tente novamente.');if(e instanceof TypeError)throw Error('Sem conexão com o servidor. Confira sua internet.');throw e;}finally{clearTimeout(timer);}
  }
  async changePassword(currentPassword,newPassword){
    if(typeof newPassword!=='string'||newPassword.length<12)throw Error('Use pelo menos 12 caracteres na nova senha.');
    if(currentPassword===newPassword)throw Error('Escolha uma senha diferente da atual.');
    const current=await this.user();
    const verified=await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:current.email,password:currentPassword}});
    if(verified.user?.id!==current.id||!verified.access_token)throw Error('Não foi possível confirmar sua conta.');
    const updated=await this.request('/auth/v1/user',{method:'PUT',token:verified.access_token,body:{password:newPassword}});
    this.store({...verified,user:updated});
  }
  async settings(){return this.request('/auth/v1/settings');}
  async login(identifier,password){const data=await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:identityEmail(identifier),password}});this.store(data);return data.user;}
  async signup(name,phone,password,inviteToken=null){
    if(inviteToken)await this.checkGuestInvite(inviteToken);
    const n=normalizePhone(phone),settings=await this.settings();
    if(settings.disable_signup)throw Error('Novos cadastros estão desativados. Fale com o administrador.');
    if(!settings.mailer_autoconfirm)throw Error('O administrador precisa desativar “Confirm email” no Supabase para liberar o cadastro sem SMS ou e-mail. Nenhuma mensagem foi enviada.');
    const data=await this.request('/auth/v1/signup',{method:'POST',body:{email:identityEmail(n),password,data:{name,phone:n,...(inviteToken?{guest_invite:inviteToken}:{})}}});
    if(!data.access_token)throw Error('Não foi possível entrar após o cadastro. Fale com o administrador.');
    this.store(data);return data.user;
  }
  async token(){
    if(!this.session)throw Error('Entre na sua conta para continuar.');
    if(this.session.expires_at>Date.now()/1000+60)return this.session.access_token;
    if(!this.refreshing)this.refreshing=this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}}).then(data=>{this.store(data);return data.access_token;}).catch(e=>{if(e.status===400||e.status===401)this.store(null);throw e;}).finally(()=>this.refreshing=null);
    return this.refreshing;
  }
  async user(){const user=await this.request('/auth/v1/user',{token:await this.token()});this.session.user=user;return user;}
  async logout(){try{if(this.session)await this.request('/auth/v1/logout?scope=local',{method:'POST',token:await this.token()});}finally{this.store(null);}}
  async rows(table,query='',fields='*'){
    const token=await this.token(),result=[];
    for(let offset=0;;offset+=1000){const rows=await this.request('/rest/v1/'+table+'?select='+encodeURIComponent(fields)+(query?'&'+query:'')+'&limit=1000&offset='+offset,{token});if(!Array.isArray(rows))throw Error('Não foi possível carregar os dados do time.');result.push(...rows);if(rows.length<1000)return result;}
  }
  async pushConfig(){
    try{return await this.request('/rest/v1/rpc/push_config',{method:'POST',body:{},token:await this.token()});}
    catch(e){if(e.status===404||e.code==='PGRST202')return {ready:false};throw e;}
  }
  async pushSubscribe(endpoint){return this.request('/rest/v1/rpc/subscribe_push',{method:'POST',body:{p_endpoint:endpoint},token:await this.token()});}
  async pushUnsubscribe(endpoint){return this.request('/rest/v1/rpc/unsubscribe_push',{method:'POST',body:{p_endpoint:endpoint},token:await this.token()});}
  async pushService(action){
    const r=await this.fetcher('/api/push/'+action,{method:'POST',headers:{Authorization:'Bearer '+await this.token()}});
    const data=await r.json();if(!r.ok)throw Error(data.message||'Não foi possível configurar as notificações.');return data;
  }
  async billingContacts(){
    try{return await this.request('/rest/v1/rpc/admin_billing_contacts',{method:'POST',body:{},token:await this.token()});}
    catch(e){if(e.status===404||e.code==='PGRST202')throw Error('Ative os contatos de cobrança no Supabase para abrir direto no jogador.');throw e;}
  }
  async photos(){
    try{
      const versions=await this.rows('player_photos','order=player_id.asc','player_id,updated_at');
      const ids=new Set(versions.map(v=>v.player_id));for(const id of this.photoCache.keys())if(!ids.has(id))this.photoCache.delete(id);
      const changed=versions.filter(v=>this.photoCache.get(v.player_id)?.updated_at!==v.updated_at).map(v=>v.player_id);
      for(let i=0;i<changed.length;i+=50){
        const rows=await this.rows('player_photos','player_id=in.('+changed.slice(i,i+50).map(encodeURIComponent).join(',')+')&order=player_id.asc');
        for(const row of rows)this.photoCache.set(row.player_id,row);
      }
      return [...this.photoCache.values()];
    }catch(e){if(e.code==='PGRST205'||e.status===404){this.photoCache.clear();return [];}throw e;}
  }
  async setPhoto(userId,data){
    try{return await this.request('/rest/v1/rpc/set_player_photo',{method:'POST',token:await this.token(),body:{p_user_id:userId,p_photo_data:data}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('As fotos ainda precisam ser ativadas no Supabase.');throw e;}
  }
  async inviteRPC(name,body,authenticated=false){
    try{return await this.request('/rest/v1/rpc/'+name,{method:'POST',body,...(authenticated?{token:await this.token()}:{})});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('Os convites de avulso ainda precisam ser ativados no Supabase.');throw e;}
  }
  async createGuestInvite(){return this.inviteRPC('create_guest_invite',{},true);}
  async checkGuestInvite(token){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))throw Error('Convite inválido. Peça um novo link ao ADM.');
    return this.inviteRPC('check_guest_invite',{p_token:token});
  }
  async guestRPC(name,body){
    try{return await this.request('/rest/v1/rpc/'+name,{method:'POST',token:await this.token(),body});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('A opção de avulsos ainda precisa ser ativada na configuração do time.');throw e;}
  }
  async collaborations(){
    try{return await this.rows('collaborations','order=month.desc,player_id.asc');}
    catch(e){if(e.code==='PGRST205'||e.status===404)return [];throw e;}
  }
  async setCollaboration(userId,month,completed){
    try{return await this.request('/rest/v1/rpc/set_collaboration',{method:'POST',token:await this.token(),body:{p_user_id:userId,p_month:month+'-01',p_completed:completed}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('A opção de colaboradores ainda precisa ser ativada no Supabase.');throw e;}
  }
  async teamDraw(date){
    try{return (await this.rows('team_draws','game_date=eq.'+date))[0]||null;}
    catch(e){if(e.code==='PGRST205'||e.status===404)return null;throw e;}
  }
  async publishDraw(date,payload){
    try{return await this.write('team_draws',{game_date:date,payload},{conflict:'game_date'});}
    catch(e){if(e.code==='PGRST205'||e.status===404)throw Error('A publicação dos times ainda precisa ser ativada no Supabase.');throw e;}
  }
  async setPosition(userId,position){
    try{return await this.request('/rest/v1/rpc/set_player_position',{method:'POST',token:await this.token(),body:{p_user_id:userId,p_position:position}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('A opção de goleiros ainda precisa ser ativada no Supabase.');throw e;}
  }
  async setMembership(userId,type){return this.guestRPC('set_player_membership',{p_user_id:userId,p_type:type});}
  async payGuest(userId,date,amount,entryId){return this.guestRPC('register_guest_payment',{p_user_id:userId,p_game_date:date,p_amount:amount,p_entry_id:entryId});}
  async markAbsent(userId,date){
    try{return await this.request('/rest/v1/rpc/mark_player_absent',{method:'POST',token:await this.token(),body:{p_user_id:userId,p_game_date:date}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('A retirada dos presentes ainda precisa ser ativada no Supabase.');throw e;}
  }
  async removePlayer(userId){
    try{return await this.request('/rest/v1/rpc/remove_team_player',{method:'POST',token:await this.token(),body:{p_user_id:userId}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('A exclusão de jogadores ainda precisa ser ativada na configuração do time.');throw e;}
  }
  async grantAdmin(userId){
    try{return await this.request('/rest/v1/rpc/grant_team_admin',{method:'POST',token:await this.token(),body:{p_user_id:userId}});}
    catch(e){if(e.code==='PGRST202'||e.status===404)throw Error('Este comando ainda precisa ser ativado na configuração do time.');throw e;}
  }
  async write(table,body,{conflict}={}){
    return this.request('/rest/v1/'+table+(conflict?'?on_conflict='+conflict:''),{method:'POST',token:await this.token(),body,headers:{Prefer:(conflict?'resolution=merge-duplicates,':'')+'return=representation'}});
  }
}
