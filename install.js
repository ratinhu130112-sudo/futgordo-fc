let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install-app').hidden=false;});
document.getElementById('install-app').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;document.getElementById('install-app').hidden=true;});
function hideInstall(){if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)document.getElementById('install-panel').hidden=true;}hideInstall();window.addEventListener('appinstalled',hideInstall);
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>console.info('Atualização offline indisponível.')));
