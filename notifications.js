export function supported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
export async function registration(){if(!supported())throw Error('Este navegador não permite notificações. No iPhone, instale o app na Tela de Início e abra pelo ícone.');await navigator.serviceWorker.register('./sw.js');return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Feche e abra o app e tente novamente.')),12000))]);}
export async function deviceEnabled(userId){
 if(!supported()||Notification.permission!=='granted'||localStorage.getItem('futgordo-push-owner')!==userId)return false;
 const reg=await navigator.serviceWorker.getRegistration();return !!(reg&&await reg.pushManager.getSubscription());
}
export async function enable(api,config,userId){
 if(!config?.ready)throw Error('O ADM precisa concluir a configuração das notificações primeiro.');
 if(!supported())throw Error('Use um navegador compatível. No iPhone, abra o app instalado na Tela de Início.');
 // Permission is requested in the click handler, before any network operation.
 if(await Notification.requestPermission()!=='granted')throw Error('Notificações não autorizadas. Libere a permissão nas configurações do celular.');
 const reg=await registration();let sub=await reg.pushManager.getSubscription();
 const key=Uint8Array.from(atob(config.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(sub){const existing=sub.options?.applicationServerKey;if(existing&&String(new Uint8Array(existing))!==String(key)){await sub.unsubscribe();sub=null;}}
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await api.pushSubscribe(sub.endpoint);}catch(e){await sub.unsubscribe();throw e;}
 localStorage.setItem('futgordo-push-owner',userId);return true;
}
export async function disable(api){localStorage.removeItem('futgordo-push-tested');localStorage.removeItem('futgordo-push-owner');if(!supported())return;const reg=await navigator.serviceWorker.getRegistration();if(!reg)return;const sub=await reg.pushManager.getSubscription();if(sub){try{await api.pushUnsubscribe(sub.endpoint);}finally{await sub.unsubscribe();}}}

export async function deviceTested(userId){
 if(!await deviceEnabled(userId))return false;
 try{const saved=JSON.parse(localStorage.getItem('futgordo-push-tested'));const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();return saved?.userId===userId&&!!sub&&saved.endpoint===sub.endpoint;}catch{return false;}
}
export async function rememberTest(userId){
 const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription();
 if(!sub)return false;
 localStorage.setItem('futgordo-push-tested',JSON.stringify({userId,endpoint:sub.endpoint}));return true;
}
