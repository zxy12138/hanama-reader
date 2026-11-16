(() => {
 const root=document.getElementById('startupScreen'),bar=document.getElementById('startupProgress'),label=document.getElementById('startupStatus');
 let completed=false;
 function stage(value,text){if(completed)return;bar.value=value;label.textContent=text;}
 function fail(error){if(completed)return;label.textContent='加载遇到问题：'+String(error?.message||error||'请重新加载');root.classList.add('startup-failed');document.getElementById('startupRetry').hidden=false;}
 window.StartupUI={stage,fail,ready:async()=>{if(completed)return;stage(100,'准备好了，回到你的故事');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));completed=true;document.body.classList.remove('booting');root.hidden=true;}};
 document.getElementById('startupRetry').onclick=()=>location.reload();
 window.addEventListener('error',e=>{if(e.error)fail(e.error);});
 window.addEventListener('unhandledrejection',e=>fail(e.reason));
 stage(12,'正在打开阅读工作台');
})();
