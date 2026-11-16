(() => {
  const api=window.hanama;if(!api?.performanceEnabled)return;
  const emit=value=>api.performanceEvent(value);
  let id=0;const pending=new WeakMap();
  const counts=details=>({characters:Number(details.dataset.characters)||0,chunks:details.querySelectorAll('.text-segment').length,messages:document.querySelector('.story')?.children.length||0,open:Number(details.open)});
  document.addEventListener('pointerdown',event=>{const details=event.target.closest('.excluded-text > summary')?.parentElement;if(!details)return;const run={id:++id,start:performance.now()};pending.set(details,run);emit({event:'exclude-input',...run,...counts(details)});},true);
  document.addEventListener('toggle',event=>{const details=event.target;if(!details.matches?.('.excluded-text'))return;const run=pending.get(details)||{id:++id,start:performance.now()};pending.delete(details);emit({event:'exclude-toggle',...run,duration:performance.now()-run.start,...counts(details)});requestAnimationFrame(()=>requestAnimationFrame(()=>emit({event:'exclude-frame',...run,duration:performance.now()-run.start,...counts(details)})));},true);
  for(const type of ['longtask','long-animation-frame']){
    if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
    new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(entry.duration<100)continue;emit({event:type==='longtask'?'long-task':'long-frame',start:entry.startTime,duration:entry.duration,blockingMs:entry.blockingDuration||0,scriptMs:(entry.scripts||[]).reduce((sum,s)=>sum+s.duration,0),layoutMs:entry.styleAndLayoutStart?Math.max(0,entry.startTime+entry.duration-entry.styleAndLayoutStart):0,renderMs:entry.renderStart?Math.max(0,entry.startTime+entry.duration-entry.renderStart):0});}}).observe({type,buffered:false});
  }
  let last=performance.now();setInterval(()=>{const now=performance.now();if(!document.hidden&&now-last>1400)emit({event:'renderer-delay',start:last,duration:now-last-1000});last=now;},1000);
})();
