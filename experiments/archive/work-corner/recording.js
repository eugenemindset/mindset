// Final interaction details, shared by the working view and the recording view.
const closeFace=document.createElement('span');closeFace.className='close-face';closeFace.setAttribute('aria-hidden','true');
for(const [file,cls] of [['close-circle.svg','close-circle'],['close-stroke-a.svg','close-stroke'],['close-stroke-b.svg','close-stroke']]){
 const img=document.createElement('img');img.src='assets/recording/'+file;img.className=cls;img.alt='';img.draggable=false;closeFace.append(img);
}
const closePanelButton=document.querySelector('#close-map');closePanelButton.replaceChildren(closeFace);closePanelButton.title='Return to tabs';closePanelButton.setAttribute('aria-label','Return panel to tabs');

const fadingNav=document.querySelector('.workspace-nav');let fadeFrame=0;
function refreshNavFade(){
 cancelAnimationFrame(fadeFrame);fadeFrame=requestAnimationFrame(()=>{
  const remaining=fadingNav.scrollWidth-fadingNav.clientWidth-fadingNav.scrollLeft;
  fadingNav.style.setProperty('--nav-fade-left',fadingNav.scrollLeft>2?'22px':'0px');
  fadingNav.style.setProperty('--nav-fade-right',remaining>2?'38px':'0px');
 });
}
fadingNav.addEventListener('scroll',refreshNavFade,{passive:true});
new ResizeObserver(refreshNavFade).observe(fadingNav);
new MutationObserver(refreshNavFade).observe(fadingNav,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
document.fonts.ready.then(refreshNavFade);refreshNavFade();
// A second quick touch is still a tab tap, never the legacy room double-click shortcut.
document.querySelector('#map-tab').ondblclick=null;

const bezel=document.createElement('img');bezel.className='recording-bezel';bezel.src='assets/recording/bezel.png';bezel.alt='';bezel.draggable=false;bezel.setAttribute('aria-hidden','true');document.querySelector('#device').append(bezel);
const touchIndicator=document.createElement('div');touchIndicator.id='touch-indicator';touchIndicator.setAttribute('popover','manual');touchIndicator.setAttribute('aria-hidden','true');document.body.append(touchIndicator);
let recordingPointer=null;
function positionTouch(e){touchIndicator.style.left=e.clientX+'px';touchIndicator.style.top=e.clientY+'px';}
function showTouch(e){
 if(!document.body.classList.contains('recording')||e.isPrimary===false)return;
 if(!touchIndicator.matches(':popover-open'))touchIndicator.showPopover();
 positionTouch(e);touchIndicator.classList.add('visible');
}
document.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||recordingPointer===e.pointerId)showTouch(e);},{capture:true,passive:true});
document.addEventListener('pointerdown',e=>{
 if(e.isPrimary===false)return;recordingPointer=e.pointerId;showTouch(e);touchIndicator.classList.add('pressed');
},{capture:true,passive:true});
function releaseTouch(e){if(e.pointerId!==recordingPointer)return;recordingPointer=null;touchIndicator.classList.remove('pressed');if(e.pointerType==='touch'||e.type==='pointercancel')touchIndicator.classList.remove('visible');}
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,releaseTouch,{capture:true,passive:true});
function hideTouch(){recordingPointer=null;touchIndicator.classList.remove('visible','pressed');}
document.documentElement.addEventListener('pointerleave',hideTouch);window.addEventListener('blur',hideTouch);
// Dialogs enter a higher layer. Promote only the decorative indicator above them.
new MutationObserver(()=>{if(document.body.classList.contains('recording')&&touchIndicator.matches(':popover-open')){touchIndicator.hidePopover();touchIndicator.showPopover();}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});

const frameSizes=['50','75','100','fit'];
let frameSize=new URLSearchParams(location.search).get('scale')||localStorage.getItem('mindset-work-corner-recording-scale-v1')||'75';
if(!frameSizes.includes(frameSize))frameSize='75';
const recordingControls=document.createElement('div');recordingControls.id='recording-controls';recordingControls.setAttribute('role','group');recordingControls.setAttribute('aria-label','Device size');
recordingControls.innerHTML='<span class="recording-controls-label">Device</span>'+frameSizes.map(value=>'<button type="button" data-frame-size="'+value+'" aria-pressed="false">'+(value==='fit'?'Fit':value+'%')+'</button>').join('')+'<button type="button" class="hide-recording-controls" title="Hide controls · H">Hide</button>';
document.body.append(recordingControls);
recordingControls.addEventListener('click',e=>{
 const button=e.target.closest('[data-frame-size]');if(button){frameSize=button.dataset.frameSize;localStorage.setItem('mindset-work-corner-recording-scale-v1',frameSize);const url=new URL(location.href);url.searchParams.set('scale',frameSize);history.replaceState(null,'',url);fit();}
 if(e.target.closest('.hide-recording-controls'))recordingControls.hidden=true;
});
const workingFit=fit;removeEventListener('resize',workingFit);
function updateResizeHitArea(){
 const scale=motionScreen.getBoundingClientRect().width/motionScreen.clientWidth;
 motionScreen.style.setProperty('--resize-hit-width',Math.max(28,Math.min(64,32/scale))+'px');
}
fit=function(){
 if(!document.body.classList.contains('recording')){workingFit();updateResizeHitArea();return;}
 const padding=Math.min(innerWidth,innerHeight)*.018;
 const fitted=Math.min((innerWidth-padding*2)/1478.76,(innerHeight-padding*2)/1074.29);
 const k=frameSize==='fit'?fitted:Math.min(Number(frameSize)/100,fitted);
 document.querySelector('#device').style.transform=`scale(${k})`;
 document.querySelector('#stage').style.cssText='';positionAvatars();updateResizeHitArea();
 recordingControls.querySelectorAll('[data-frame-size]').forEach(button=>{
  const value=button.dataset.frameSize,unavailable=value!=='fit'&&Number(value)/100>fitted+.001;
  button.disabled=unavailable;button.setAttribute('aria-pressed',String(value==='fit'?k===fitted:value===frameSize&&!unavailable));
 });
};
addEventListener('resize',fit);
function setRecording(enabled){
 document.body.classList.toggle('recording',enabled);hideTouch();if(!enabled&&touchIndicator.matches(':popover-open'))touchIndicator.hidePopover();
 setRecordingHints(enabled);
 const url=new URL(location.href);if(enabled)url.searchParams.set('record','1');else url.searchParams.delete('record');history.replaceState(null,'',url);fit();
}
const recordControl=document.querySelector('#capture');recordControl.textContent='Record view';recordControl.title='Recording view · F for fullscreen';
recordControl.onclick=()=>setRecording(true);
document.addEventListener('keydown',e=>{
 if(e.target.closest('input,textarea,[contenteditable=true]')||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key.toLowerCase()==='h'&&document.body.classList.contains('recording')){e.preventDefault();recordingControls.hidden=!recordingControls.hidden;}
 if(e.key.toLowerCase()==='f'&&document.body.classList.contains('recording')){
  e.preventDefault();if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});
 }
});

// Native title bubbles belong to the working view, never to the recorded product.
function muteRecordingTitles(root){
 if(!(root instanceof Element))return;
 for(const node of [...(root.hasAttribute('title')?[root]:[]),...root.querySelectorAll('[title]')]){
  const title=node.getAttribute('title');
  if(title){
   node.setAttribute('data-recording-title',title);
   if(node.matches('button,canvas,[role=button]')&&!node.hasAttribute('aria-label'))node.setAttribute('aria-label',title);
  }
  node.removeAttribute('title');
 }
}
function setRecordingHints(muted){
 if(muted)muteRecordingTitles(document.body);
 else for(const node of document.querySelectorAll('[data-recording-title]')){node.title=node.getAttribute('data-recording-title');node.removeAttribute('data-recording-title');}
}
new MutationObserver(records=>{
 if(!document.body.classList.contains('recording'))return;
 for(const record of records){
  if(record.type==='attributes')muteRecordingTitles(record.target);
  else for(const node of record.addedNodes)muteRecordingTitles(node);
 }
}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
document.addEventListener('contextmenu',e=>{if(document.body.classList.contains('recording'))e.preventDefault();});
setRecording(new URLSearchParams(location.search).get('record')!=='0');
