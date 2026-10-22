// A drag is a reversible layout transaction: preview first, commit on release.
const motionScreen=document.querySelector('.screen');
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const paneEase='cubic-bezier(.22,1,.36,1)';
// Animate real bounds. Never scale a panel: its type and controls keep their shape.
const arrangements=new Map();
function settleArrangements(){for(const entry of [...arrangements.values()])entry.finish();}
function panelSlot(node){return arrangements.get(node)?.target||{x:node.offsetLeft,y:node.offsetTop,w:node.offsetWidth,h:node.offsetHeight};}
animateArrangement=function(change,exclude=null){
 const nodes=[...motionScreen.querySelectorAll(':scope > .panel')].filter(n=>n!==exclude);
 const sr=motionScreen.getBoundingClientRect(),scale=sr.width/motionScreen.clientWidth;
 const before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()])),beforeRail=document.querySelector('#chat-rail').getBoundingClientRect();
 settleArrangements();motionScreen.classList.add('arranging');change();
 const targets=new Map(nodes.map(n=>[n,{x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight}]));
 if(!reducedMotion())for(const n of nodes){
  const layout=targets.get(n);let a=before.get(n),t=layout;
  if(n.classList.contains('chat')&&!state.chatCollapsed&&a.width<1)a=beforeRail;
  // A newly created pane has no previous bounds. Its preview already owns the
  // destination; animating from the hidden element's zero rect makes it fly in.
  if(n.hidden||(!a.width&&!t.w)||(n.id==='map-dock'&&(a.width<1||state.previewDock)))continue;
  // The closing chat lands on the handle's exact silhouette before handing over.
  const closingChat=n.classList.contains('chat')&&state.chatCollapsed&&motionScreen.classList.contains('chat-transition');
  if(closingChat){const rail=document.querySelector('#chat-rail');t={x:rail.offsetLeft,y:rail.offsetTop,w:rail.offsetWidth,h:rail.offsetHeight};}
  const from={left:(a.x-sr.x)/scale,top:(a.y-sr.y)/scale,width:a.width/scale,height:a.height/scale};
  if(Math.abs(from.left-t.x)+Math.abs(from.width-t.w)+Math.abs(from.top-t.y)<.5)continue;
  const placeholder=document.createElement('div');placeholder.className='pane-layout-slot';placeholder.setAttribute('aria-hidden','true');
  Object.assign(placeholder.style,{order:getComputedStyle(n).order,flex:`0 0 ${layout.w}px`,height:layout.h+'px'});n.before(placeholder);
  const props=['position','left','top','width','height','minWidth','flex','zIndex'];const original=Object.fromEntries(props.map(k=>[k,n.style[k]]));
  Object.assign(n.style,{position:'absolute',left:t.x+'px',top:t.y+'px',width:t.w+'px',height:t.h+'px',minWidth:'0',flex:'none',zIndex:'3'});
  const animation=n.animate([Object.fromEntries(Object.entries(from).map(([k,v])=>[k,v+'px'])),{left:t.x+'px',top:t.y+'px',width:t.w+'px',height:t.h+'px'}],{duration:380,easing:paneEase});
  const entry={target:layout,finish(){if(arrangements.get(n)!==entry)return;arrangements.delete(n);if(closingChat)motionScreen.classList.remove('chat-closing');animation.cancel();Object.assign(n.style,original);placeholder.remove();if(!arrangements.size)motionScreen.classList.remove('arranging');}};
  arrangements.set(n,entry);animation.onfinish=entry.finish;
 }
 if(!arrangements.size)motionScreen.classList.remove('arranging');positionAvatars();
};
const beforeMotionLayout=applyPanelLayout;
function updateDetachedTabs(){document.querySelectorAll('.workspace-nav button[data-view]').forEach(b=>{b.hidden=!!state.docked&&!state.previewDock&&b.dataset.view===state.dockView;});}
applyPanelLayout=function(){if(state.docked){const available=100-(state.chatCollapsed?0:state.left)-59/motionScreen.clientWidth*100,min=Math.min(340/motionScreen.clientWidth*100,available/2);state.dockWidth=Math.max(min,Math.min(available-min,state.dockWidth));}beforeMotionLayout();updateDetachedTabs();const rail=document.querySelector('#chat-rail');rail.setAttribute('aria-expanded',String(!state.chatCollapsed));rail.setAttribute('aria-label',state.chatCollapsed?'Expand chat':'Collapse chat');rail.title=state.chatCollapsed?'Expand chat':'Collapse chat';};
const chat=document.querySelector('.chat');let chatTimer=0,chatWidthBeforeResize=null;
const chatDivider=document.querySelector('#divider');
chatDivider.onpointerdown=e=>{
 if(e.button!==0||e.isPrimary===false)return;e.preventDefault();
 const startX=e.clientX,initial=state.chatCollapsed?0:state.left,width=motionScreen.getBoundingClientRect().width;
 chatDivider.setPointerCapture(e.pointerId);
 chatDivider.onpointermove=move=>{if(move.pointerId===e.pointerId)resizeLeft(initial+(move.clientX-startX)/width*100);};
 const finish=event=>{if(event.pointerId!==e.pointerId)return;chatDivider.onpointermove=null;};
 chatDivider.onpointerup=chatDivider.onpointercancel=chatDivider.onlostpointercapture=finish;
};
chatDivider.addEventListener('pointerdown',()=>{settleArrangements();chatWidthBeforeResize=state.chatCollapsed?state.chatReturnWidth:state.left;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])chatDivider.addEventListener(event,()=>{chatWidthBeforeResize=null;});
document.querySelector('#map-divider').addEventListener('pointerdown',settleArrangements);
for(const divider of [chatDivider,document.querySelector('#map-divider')]){
 divider.addEventListener('pointerdown',()=>divider.classList.add('is-resizing'));
 for(const event of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(event,()=>divider.classList.remove('is-resizing'));
}
toggleChat=function(force,{width:requestedWidth,direct=false}={}){
 const collapse=force===undefined?!state.chatCollapsed:force;if(collapse===state.chatCollapsed)return;
 clearTimeout(chatTimer);const chatScroll=document.querySelector('#chat-scroll');
 if(collapse)state.chatScrollTop=chatScroll.scrollTop;
 if(collapse)state.chatReturnWidth=chatWidthBeforeResize||state.left;
 else state.left=Math.max(19,Math.min(state.docked?43:58,requestedWidth??state.chatReturnWidth??37.6));
 if(direct){
  settleArrangements();state.chatCollapsed=collapse;applyPanelLayout();chat.inert=collapse;
  motionScreen.classList.remove('chat-transition','chat-closing');chat.style.removeProperty('--chat-reading-width');
  chatScroll.scrollTop=state.chatScrollTop||0;positionAvatars();return;
 }
 const width=collapse?(parseFloat(chat.style.getPropertyValue('--chat-reading-width'))||chat.getBoundingClientRect().width/(motionScreen.getBoundingClientRect().width/motionScreen.clientWidth)):motionScreen.clientWidth*state.left/100;
 chat.style.setProperty('--chat-reading-width',width+'px');motionScreen.classList.add('chat-transition');motionScreen.classList.toggle('chat-closing',collapse);
 motionScreen.classList.remove('resizing');
 animateArrangement(()=>{state.chatCollapsed=collapse;applyPanelLayout();});
 chat.inert=collapse;chatScroll.scrollTop=state.chatScrollTop||0;
 chatTimer=setTimeout(()=>{motionScreen.classList.remove('chat-transition','chat-closing');if(!state.chatCollapsed){chat.style.removeProperty('--chat-reading-width');chatScroll.scrollTop=state.chatScrollTop||0;}positionAvatars();},reducedMotion()?0:400);
};
resizeLeft=function(n){
 if(n<9){toggleChat(true);return;}
 const width=Math.max(19,Math.min(state.docked?43:58,n));
 if(state.chatCollapsed){if(n<16)return;toggleChat(false,{width,direct:true});return;}
 // Direct manipulation owns the width. A previous reveal must not keep an old target.
 settleArrangements();clearTimeout(chatTimer);motionScreen.classList.remove('chat-transition','chat-closing');chat.style.removeProperty('--chat-reading-width');
 state.left=width;applyPanelLayout();
};
document.querySelector('#chat-rail').onclick=()=>toggleChat();
document.querySelector('#divider').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();if(state.chatCollapsed&&e.key==='ArrowRight')toggleChat(false);else resizeLeft(state.left+(e.key==='ArrowRight'?4:-4));};

const dropPreview=document.createElement('div');dropPreview.id='pane-drop-preview';dropPreview.setAttribute('aria-hidden','true');motionScreen.append(dropPreview);
const dragStatus=document.createElement('div');dragStatus.className='sr-only';dragStatus.setAttribute('role','status');dragStatus.setAttribute('aria-live','polite');motionScreen.append(dragStatus);
const snapshotLayout=()=>Object.fromEntries(['docked','dockView','view','detail','left','previousChatWidth','dockWidth','chatCollapsed','previewDock'].map(k=>[k,state[k]]));
function makeDetached(view,side,preview=false){
 state.dockView=view;state.docked=side;state.previewDock=preview;
 document.querySelector('#map-dock').classList.toggle('dock-preview',preview);
 state.dockWidth=Math.max(26,(100-(state.chatCollapsed?0:state.left)-4)/2);
 if(state.view===view)state.view=view==='products'?'pinned':'products';state.detail=null;render();
}
detachView=function(view,side){animateArrangement(()=>makeDetached(view,side));dragStatus.textContent=labels[view]+' opened '+(side==='right'?'on the right':'on the left');};
closeDock=function(){animateArrangement(()=>{const view=state.dockView;state.docked=null;state.view=view;state.detail=null;state.previewDock=false;render();});};
document.querySelector('#close-map').onclick=()=>closeDock();

let activePaneDrag=null;
installPanelDrag=function(handle,view){
 handle.ondragstart=e=>e.preventDefault();
 handle.onpointerdown=start=>{
  if(start.button!==0||start.isPrimary===false)return;
  // Keep focus from scrolling a clipped tab or the device during pointer capture.
  start.preventDefault();activePaneDrag?.();suppressMapClickUntil=0;
  const dock=document.querySelector('#map-dock'),workspace=document.querySelector('.workspace'),ghost=document.querySelector('#drag-map-ghost');
  const savedLayout=snapshotLayout(),sr=motionScreen.getBoundingClientRect(),scale=sr.width/motionScreen.clientWidth;
  const wr=workspace.getBoundingClientRect(),dr=dock.getBoundingClientRect();
  const boundary=(Math.min(wr.left,savedLayout.docked?dr.left:wr.left)+Math.max(wr.right,savedLayout.docked?dr.right:wr.right))/2;
  const sx=start.clientX,sy=start.clientY,grabX=sx-dr.x,grabY=sy-dr.y;
  let begun=false,moved=false,finished=false,valid=false,side=savedLayout.docked||'right',slot=null;
  const isExisting=!view||(savedLayout.docked&&view===savedLayout.dockView);
  const name=view||savedLayout.dockView;
  handle.setPointerCapture(start.pointerId);
  function readSlot(){
   // offsetLeft is the layout destination, unaffected by the floating transform.
   slot=panelSlot(dock);
   Object.assign(dropPreview.style,{left:(slot.x+6)+'px',top:(slot.y+6)+'px',width:(slot.w-12)+'px',height:(slot.h-12)+'px'});
  }
  function moveFloating(e){
   if(!view){dock.style.transform=`translate(${(e.clientX-sr.x-grabX)/scale-slot.x}px,${(e.clientY-sr.y-grabY)/scale-slot.y}px)`;}
   else{ghost.style.left=(e.clientX-sr.x)/scale+'px';ghost.style.top=(e.clientY-sr.y)/scale+'px';}
  }
  function cleanup(){
   activePaneDrag=null;
   finished=true;handle.onpointermove=handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=null;
   document.removeEventListener('keydown',escape);if(handle.hasPointerCapture(start.pointerId))handle.releasePointerCapture(start.pointerId);
   motionScreen.classList.remove('pane-dragging');dropPreview.classList.remove('visible');handle.classList.remove('drag-source');
   ghost.style.display='none';dock.classList.remove('drag-lift','dock-preview');dock.style.transform='';
   if(begun||moved)suppressMapClickUntil=performance.now()+450;
   if(begun&&document.activeElement===handle)handle.blur();
  }
  function settleFloating(floating){
   if(!floating||reducedMotion())return;
   const rest=dock.getBoundingClientRect();dock.animate([{transform:`translate(${(floating.x-rest.x)/scale}px,${(floating.y-rest.y)/scale}px)`,boxShadow:'0 24px 65px #0003'},{transform:'none',boxShadow:'0 0 0 #0000'}],{duration:380,easing:paneEase});
  }
  function finish(commit){
   if(finished)return;const floating=begun&&!view?dock.getBoundingClientRect():null;cleanup();if(!begun)return;
   if(!commit){
    if(isExisting){animateArrangement(()=>{state.docked=savedLayout.docked;applyPanelLayout();},dock);settleFloating(floating);}
    else animateArrangement(()=>{Object.assign(state,savedLayout);render();});
    dragStatus.textContent='Move cancelled';return;
   }
   settleFloating(floating);
   if(!isExisting){state.previewDock=false;renderDock();const host=document.querySelector('#dock-map-content');mountScenes(host);canvasDrag(host);}else applyPanelLayout();
   dragStatus.textContent=labels[name]+' placed '+(side==='right'?'on the right':'on the left');positionAvatars();
  }
  function escape(e){if(e.key==='Escape'){e.preventDefault();finish(false);}}
  activePaneDrag=()=>finish(false);
  document.addEventListener('keydown',escape);
  handle.onpointermove=e=>{
   if(finished||e.pointerId!==start.pointerId)return;
   if(!begun){
    if(Math.hypot(e.clientX-sx,e.clientY-sy)<9)return;
    moved=true;
    // The same short movement lifts a tab in every direction. Its menu order stays fixed.
    begun=true;side=e.clientX>boundary?'right':'middle';handle.classList.add('drag-source');motionScreen.classList.add('pane-dragging');
    if(!isExisting){animateArrangement(()=>makeDetached(name,side,true));}
    else {settleArrangements();dock.getAnimations().forEach(a=>a.cancel());if(!view)dock.classList.add('drag-lift');if(state.docked!==side)animateArrangement(()=>{state.docked=side;applyPanelLayout();},!view?dock:null);}
    if(view){ghost.textContent=labels[name];ghost.style.display='block';}
    readSlot();dragStatus.textContent='Move '+labels[name]+'. Escape to cancel.';
   }
   e.preventDefault();valid=e.clientX>=sr.left&&e.clientX<=sr.right&&e.clientY>=sr.top&&e.clientY<=sr.bottom;
   const next=e.clientX<boundary-28?'middle':e.clientX>boundary+28?'right':side;
   if(valid&&next!==side){side=next;animateArrangement(()=>{state.docked=side;applyPanelLayout();},!view?dock:null);readSlot();}
   dropPreview.classList.toggle('visible',valid);moveFloating(e);
  };
  handle.onpointerup=e=>{if(e.pointerId!==start.pointerId)return;if(begun){valid=e.clientX>=sr.left&&e.clientX<=sr.right&&e.clientY>=sr.top&&e.clientY<=sr.bottom;}finish(valid);};
  handle.onpointercancel=e=>{if(e.pointerId===start.pointerId)finish(false);};handle.onlostpointercapture=e=>{if(e.pointerId===start.pointerId&&!finished)finish(false);};
 };
};
document.querySelectorAll('.workspace-nav button[data-view]').forEach(b=>installPanelDrag(b,b.dataset.view));
installPanelDrag(document.querySelector('#map-dock-handle'),null);
// The scene already contains the plant: include it in the initial demo selection once.
if(!localStorage.getItem('mindset-work-corner-setup-plant-v1')){
 if(Object.keys(state.chosen).length===3&&!state.chosen.plant&&state.tune.plant!=='none')state.chosen.plant=state.tune.plant==='rubber'?'plant-rubber':'plant-snake';
 localStorage.setItem('mindset-work-corner-setup-plant-v1','1');persist();render();
}
applyPanelLayout();
