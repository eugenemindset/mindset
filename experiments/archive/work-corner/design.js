// Presentation and interaction refinements layered over the existing prototype state.
const sendButton=document.querySelector('.composer button[type=submit]');
function syncSend(){sendButton.disabled=!document.querySelector('#main-input').value.trim();}
document.querySelector('#main-input').addEventListener('input',syncSend);document.querySelector('#main-form').addEventListener('submit',syncSend);syncSend();
const originalQuestion=question;question=function(t){originalQuestion(t);syncSend();};
document.querySelector('#astra-home').onclick=()=>document.querySelector('#chat-scroll').scrollTo({top:0,behavior:'smooth'});
document.querySelector('#projects').onclick=()=>document.querySelector('#projects-dialog').showModal();
document.querySelector('#current-project').onclick=()=>document.querySelector('#projects-dialog').close();
document.querySelector('#share-workspace').onclick=()=>document.querySelector('#share-dialog').showModal();
document.querySelector('#view-list').onclick=()=>{document.querySelector('.workspace').classList.remove('gallery-view');document.querySelector('.workspace').classList.add('board-list');document.querySelector('#view-list').setAttribute('aria-pressed','true');document.querySelector('#view-cards').setAttribute('aria-pressed','false');};
document.querySelector('#view-cards').onclick=()=>{document.querySelector('.workspace').classList.add('gallery-view');document.querySelector('.workspace').classList.remove('board-list');document.querySelector('#view-cards').setAttribute('aria-pressed','true');document.querySelector('#view-list').setAttribute('aria-pressed','false');};
document.querySelector('#voice-input').onclick=()=>{const API=window.SpeechRecognition||window.webkitSpeechRecognition;if(!API){toast('Dictation is unavailable in this browser. You can type here.');document.querySelector('#main-input').focus();return;}const r=new API();r.lang=navigator.language;r.onresult=e=>{document.querySelector('#main-input').value=e.results[0][0].transcript;syncSend();};r.onerror=()=>toast('Could not start dictation. Check microphone access.');r.start();};
// Preserve notes and scene choices, but start the new composition at its designed framing.
if(!localStorage.getItem('mindset-work-corner-design-layout-v1')){state.boardView=null;state.cardPositions={};localStorage.setItem('mindset-work-corner-design-layout-v1','1');render();}

// Reveal newly saved notes without making the user hunt across the canvas.
document.querySelector('#note-form').addEventListener('submit',()=>requestAnimationFrame(()=>{const n=state.notes.find(n=>n.id===state.edit)||state.notes.at(-1);const card=document.querySelector('[data-card="'+n.id+'"]');if(card){state.boardView={x:75-card.offsetLeft*.8,y:70-card.offsetTop*.8,z:.8};render();persist();}}));
// Avatars follow the last visible message for each speaker in the scrolling conversation.
for(const role of ['user','ai']){const img=document.createElement('span');img.className='speaker-avatar';img.dataset.speaker=role;const photo=document.createElement('img');photo.src='assets/design/avatar-'+(role==='user'?'user-original':'ai')+'.png';photo.alt=role==='user'?'You':'Astra';img.append(photo);document.querySelector('.screen').append(img);}
function positionAvatars(){const area=document.querySelector('#chat-scroll'),screen=document.querySelector('.screen'),r=area.getBoundingClientRect(),s=screen.getBoundingClientRect(),scale=s.width/screen.clientWidth;for(const role of ['user','ai']){const avatar=document.querySelector('[data-speaker='+role+']');const msgs=[...area.querySelectorAll(role==='user'?'.message.user':'.message:not(.user)')].filter(n=>{const b=n.getBoundingClientRect();return b.bottom>r.top+15&&b.top<r.bottom-25;});const m=msgs.at(-1);avatar.hidden=!m||state.chatCollapsed;if(m){const text=m.querySelector('p').getBoundingClientRect();avatar.style.top=(Math.max(r.top+8,Math.min(r.bottom-32,text.top))-s.top)/scale+'px';}}}
document.querySelector('#chat-scroll').addEventListener('scroll',positionAvatars,{passive:true});new MutationObserver(positionAvatars).observe(document.querySelector('#chat-scroll'),{childList:true,subtree:true});new ResizeObserver(positionAvatars).observe(document.querySelector('.chat'));addEventListener('resize',positionAvatars);document.fonts.ready.then(positionAvatars);
const labels={pinned:'Pinned',products:'Products',room:'3D',ideas:'Ideas',summary:'My setup'};state.dockView='room';
function animateArrangement(change){
 const screen=document.querySelector('.screen'),nodes=[...screen.querySelectorAll(':scope>.panel')],scale=screen.getBoundingClientRect().width/screen.clientWidth;
 const before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));
 nodes.forEach(n=>n.getAnimations().forEach(a=>a.cancel()));screen.classList.add('arranging');change();
 const after=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const n of nodes){const a=before.get(n),b=after.get(n);if(!b.width)continue;
 const from=a.width?`translate(${(a.x-b.x)/scale}px,${(a.y-b.y)/scale}px) scale(${a.width/b.width},${a.height/b.height})`:'translateY(12px) scale(.98)';
 n.animate([{transform:from,opacity:a.width?1:0},{transform:'none',opacity:1}],{duration:440,easing:'cubic-bezier(.22,1,.36,1)'});
 }screen.classList.remove('arranging');positionAvatars();
}

renderDock=function(){applyPanelLayout();const host=document.querySelector('#dock-map-content');host.className='detached-content '+(state.dockView==='room'||state.dockView==='pinned'?'edge-detached':'');host.dataset.view=state.dockView;host.innerHTML=state.docked&&!state.previewDock?({pinned:board,products:catalogue,room,ideas:consider,summary:plan}[state.dockView])():'';document.querySelector('#map-dock-handle').textContent='⠿ '+labels[state.dockView];document.querySelector('#map-dock').dataset.view=state.dockView;};
function detachView(view,side){animateArrangement(()=>{state.dockView=view;state.docked=side;if(!state.chatCollapsed&&state.left>30){state.previousChatWidth=state.left;state.left=28;}if(state.view===view)state.view=view==='products'?'pinned':'products';state.detail=null;render();});}
dockMap=function(side){detachView('room',side);};
closeDock=function(){animateArrangement(()=>{const view=state.dockView;state.docked=null;state.view=view;state.detail=null;if(!state.chatCollapsed)state.left=state.previousChatWidth;render();});};
setView=function(v){if(state.docked&&v===state.dockView){document.querySelector('#map-dock-handle').focus();return;}state.buildDesk=false;delete state.transition;state.view=v;state.detail=null;render();document.querySelector('#workspace-content').scrollTop=0;};
document.querySelector('#close-map').onclick=closeDock;document.querySelector('#move-map').onclick=()=>animateArrangement(()=>{state.docked=state.docked==='right'?'middle':'right';applyPanelLayout();});
function installPanelDrag(handle,view){handle.onpointerdown=e=>{
 if(e.button!==0)return;const x=e.clientX,y=e.clientY,screen=document.querySelector('.screen'),ghost=document.querySelector('#drag-map-ghost'),pane=view?null:document.querySelector('#map-dock');
 const sr=screen.getBoundingClientRect(),scale=sr.width/screen.clientWidth;let dragged=false,target=null,overNav=false;
 handle.setPointerCapture(e.pointerId);
 const finish=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;handle.onlostpointercapture=null;screen.classList.remove('dragging-map');document.querySelectorAll('.drop-zone').forEach(z=>z.classList.remove('target'));handle.classList.remove('drag-source');ghost.style.display='none';if(pane){pane.classList.remove('drag-lift');pane.style.transform='';}if(dragged)suppressMapClickUntil=performance.now()+400;};
 handle.onpointermove=e=>{
 if(!dragged&&Math.hypot(e.clientX-x,e.clientY-y)<8)return;
 if(!dragged&&pane){pane.getAnimations().forEach(a=>a.cancel());pane.classList.add('drag-lift');}dragged=true;
 const name=view||state.dockView,r=screen.getBoundingClientRect(),nav=document.querySelector('.workspace-nav').getBoundingClientRect(),work=document.querySelector('.workspace').getBoundingClientRect(),dock=document.querySelector('#map-dock').getBoundingClientRect();
 overNav=e.clientY>=nav.top&&e.clientY<=nav.bottom&&e.clientX>=nav.left&&e.clientX<=nav.right;
 const boundary=state.docked?(Math.min(work.left,dock.left)+Math.max(work.right,dock.right))/2:r.left+r.width*.73;
 target=e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom?null:e.clientX>boundary?'right':'middle';
 handle.classList.add('drag-source');screen.classList.toggle('dragging-map',!overNav);
 for(const side of ['middle','right']){const z=document.querySelector('#drop-'+side);z.classList.toggle('target',target===side);z.querySelector('span').textContent=labels[name];}
 if(pane){pane.style.transform=`translate(${(e.clientX-x)/scale}px,${(e.clientY-y)/scale}px) scale(.975)`;}
 else{ghost.textContent=labels[name];ghost.style.display='block';ghost.style.left=(e.clientX-r.left)/scale+'px';ghost.style.top=(e.clientY-r.top)/scale+'px';}
 };
 handle.onpointerup=e=>{const name=view||state.dockView,should=dragged,side=target,nav=overNav;
 // Preserve the lifted position as the starting point of the settling animation.
 const lifted=pane&&dragged?pane.getBoundingClientRect():null;finish();if(!should)return;
 if(lifted){const rest=pane.getBoundingClientRect();pane.style.transform=`translate(${(lifted.x-rest.x)/scale}px,${(lifted.y-rest.y)/scale}px) scale(.975)`;}
 if(nav){if(!view){closeDock();}else{const buttons=[...document.querySelectorAll('.workspace-nav button[data-view]')].filter(b=>b!==handle),next=buttons.find(b=>e.clientX<b.getBoundingClientRect().x+b.getBoundingClientRect().width/2);document.querySelector('.workspace-nav').insertBefore(handle,next||document.querySelector('#expand'));}}
 else if(side){if(!view){animateArrangement(()=>{pane.style.transform='';state.docked=side;applyPanelLayout();});}else detachView(name,side);}
 else if(pane)animateArrangement(()=>{pane.style.transform='';});
 if(pane)pane.style.transform='';
 };handle.onpointercancel=finish;handle.onlostpointercapture=finish;
};}

document.querySelectorAll('.workspace-nav [data-view]').forEach(b=>{installPanelDrag(b,b.dataset.view);b.onkeydown=e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();detachView(b.dataset.view,e.key==='ArrowLeft'?'middle':'right');}};});installPanelDrag(document.querySelector('#map-dock-handle'),null);
// Suppress the click generated after dragging any tab, not just the 3D tab.
document.addEventListener('click',e=>{if(performance.now()<suppressMapClickUntil&&e.target.closest('.workspace-nav [data-view],#map-dock-handle')){e.preventDefault();e.stopImmediatePropagation();}},true);
for(const id of ['divider','map-divider']){const d=document.getElementById(id);d.addEventListener('pointerdown',()=>document.querySelector('.screen').classList.add('resizing'));for(const event of ['pointerup','pointercancel','lostpointercapture'])d.addEventListener(event,()=>{document.querySelector('.screen').classList.remove('resizing');positionAvatars();});}
state.evening=false;render();positionAvatars();

document.querySelector('#open-corner-photo').onclick=()=>document.querySelector('#attachment-dialog').showModal();
document.querySelector('#attachment-dialog').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
// Global controls belong to the workspace shell, independent of its open panes.
const globalTools=document.querySelector('.pane-tools');document.querySelector('.workspace').append(globalTools);globalTools.append(document.querySelector('#add'));labels.room='My space';
function updateCounts(){document.querySelector('#product-count').textContent=products.length;document.querySelector('#idea-count').textContent=ideas.length;document.querySelector('#setup-count').textContent=Object.values(state.chosen).filter(Boolean).length;}
new MutationObserver(updateCounts).observe(document.querySelector('#workspace-content'),{childList:true});updateCounts();
// Keep the shared menu inside the rightmost pane for every arrangement.
function placeRightMenu(){const workspace=document.querySelector('.workspace'),dock=document.querySelector('#map-dock');const owner=state.docked==='right'?dock:workspace;workspace.classList.toggle('owns-menu',owner===workspace);dock.classList.toggle('owns-menu',owner===dock);if(globalTools.parentElement!==owner)owner.append(globalTools);}
const layoutWithRightMenu=applyPanelLayout;applyPanelLayout=function(){layoutWithRightMenu();placeRightMenu();};placeRightMenu();

// Figma polish: labels carry their underline; counts stay undecorated.
for(const button of document.querySelectorAll('.workspace-nav button[data-view]')){const text=[...button.childNodes].find(n=>n.nodeType===3);if(text){const label=document.createElement('span');label.className='tab-label';label.textContent=text.textContent.trim();text.replaceWith(label);}}
function polishChatLinks(){
 for(const b of document.querySelectorAll('.message .inline-object')){
 const a=b.dataset.action;let label,count,icon='pin';
 if(a==='canvas'){label='Pinned';count=state.notes.length;}
 else if(a==='product'){label='New item';count=1;icon='bag';}
 else if(a==='products'){label='Products';count=products.length;icon='bag';}
 else if(a==='room'){label='My space';count=1;}
 else if(a==='plan'||a==='trip'){label='My setup';count=Object.values(state.chosen).filter(Boolean).length;}
 else{label='Pinned';count=1;}
 const html='<span class="link-glyph link-'+icon+'" aria-hidden="true"></span><span class="context-label">'+label+'</span><span class="context-count">'+count+'</span>';
 b.classList.add('context-link');if(b.innerHTML!==html)b.innerHTML=html;
 }
}
polishChatLinks();new MutationObserver(polishChatLinks).observe(document.querySelector('#chat-scroll'),{childList:true,subtree:true});
new MutationObserver(polishChatLinks).observe(document.querySelector('#workspace-content'),{childList:true});

document.addEventListener('click',e=>{if(e.target.closest('[data-action="edit-direction"]')){state.edit=null;document.querySelector('#note-title').value='My direction';document.querySelector('#note-body').value=state.brief.wish;document.querySelector('#note-dialog').showModal();document.querySelector('#note-dialog').dataset.direction='true';}});
document.querySelector('#note-form').addEventListener('submit',e=>{const dialog=document.querySelector('#note-dialog');if(dialog.dataset.direction){e.preventDefault();e.stopImmediatePropagation();state.brief.wish=document.querySelector('#note-body').value;delete dialog.dataset.direction;persist();dialog.close();render();}},true);
document.querySelector('#note-dialog').addEventListener('close',()=>delete document.querySelector('#note-dialog').dataset.direction);

// Figma's shared button surface: Fill + Shadow below Glass Effect.
function installGlassSurfaces(){
 document.querySelectorAll('.astra-pill,.composer button[type=submit],.workspace-nav button[data-view],.zoom-controls,.tool-group,.share-tool').forEach(el=>{
  if(el.querySelector(':scope > .glass-surface'))return;
  el.classList.add('layered-glass');
  el.insertAdjacentHTML('afterbegin','<i class="glass-surface" aria-hidden="true"><i class="glass-base"><i class="glass-add-fill"></i><i class="glass-luminosity-fill"></i></i><i class="glass-top"><i class="glass-inner-burn"></i><i class="glass-inner-light glass-light-top"></i><i class="glass-inner-light glass-light-bottom"></i></i></i>');
 });
}
installGlassSurfaces();
new MutationObserver(installGlassSurfaces).observe(document.querySelector('#workspace-content'),{childList:true,subtree:true});
new MutationObserver(installGlassSurfaces).observe(document.querySelector('#dock-map-content'),{childList:true,subtree:true});
