// Save only through the device's native password manager, never app storage.
const PREFIX='golzoom:';
export function canRemember(){return typeof PasswordCredential!=='undefined'&&!!navigator.credentials&&window.top===window.self;}
export async function rememberGolzoom(email,password){
 if(!canRemember())return false;
 await navigator.credentials.store(new PasswordCredential({id:PREFIX+email.trim().toLowerCase(),name:'GolZoom — '+email.trim(),password}));
 return true;
}
export async function recallGolzoom(){
 if(!canRemember())return null;
 const saved=await navigator.credentials.get({password:true,mediation:'required'});
 if(!saved||saved.type!=='password'||!saved.id.startsWith(PREFIX))return null;
 return {email:saved.id.slice(PREFIX.length),password:saved.password};
}
