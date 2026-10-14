import * as T from './three.module.js';
export function createTable(){
 const root=new T.Group(), chassis=new T.Group(), crown=new T.Group();root.add(chassis,crown);
 const parts=[], screws=[], feet=[], lower=[], upper=[], pairs=[], woodScrews=[], mount=[];
 const steel=new T.MeshStandardMaterial({color:0x30352f,metalness:.67,roughness:.37});
 const edge=new T.MeshStandardMaterial({color:0x353b31,metalness:.65,roughness:.3});
 const boltMetal=new T.MeshStandardMaterial({color:0x555c50,metalness:.8,roughness:.28});
 const dark=new T.MeshStandardMaterial({color:0x121711,roughness:.63});
 function grain(){let c=document.createElement('canvas');c.width=1024;c.height=512;let ctx=c.getContext('2d');ctx.fillStyle='#996c46';ctx.fillRect(0,0,1024,512);let seed=751;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};for(let i=0;i<1800;i++){let y=random()*512;ctx.strokeStyle=`rgba(${random()>.55?'59,32,11':'249,193,122'},${.02+random()*.12})`;ctx.lineWidth=.25+random()*1.1;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<1050;x+=12)ctx.lineTo(x,y+Math.sin(x*.014+y*.029)*(2+Math.sin(x*.006)*4));ctx.stroke();}for(let i=0;i<4;i++){let y=i*128;ctx.fillStyle='#51331120';ctx.fillRect(0,y,1024,1);ctx.fillStyle='#f0cc9320';ctx.fillRect(0,y+1,1024,1);}const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=8;return tx;}
 const wood=new T.MeshStandardMaterial({map:grain(),color:0xe7d4b8,roughness:.57,metalness:0});
 function mesh(geo,mat,parent){const m=new T.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent?.add(m);return m;}
 function beam(parent,x,y,z,w,h,d,mat=steel){const m=mesh(new T.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
 function part(name,parent,pos=[0,0,0]){const g=new T.Group();g.name=name;g.position.fromArray(pos);g.userData.base=new T.Vector3(...pos);g.userData.baseQ=new T.Quaternion();parent.add(g);parts.push(g);return g;}
 const sideFrames=[-1,1].map(s=>{const g=part('Боковина',chassis,[s*.429,0,0]);for(const z of [-.209,.209]){beam(g,0,.239,z,.021,.43,.021);const cap=beam(g,0,.447,z,.020,.002,.020,edge);}beam(g,0,.121,0,.021,.021,.438);return g;});
 const shelf=part('Сетчатая полка',chassis,[0,.121,0]);
 for(const z of [-.198,.198])beam(shelf,0,0,z,.837,.014,.016);for(const x of [-.411,.411])beam(shelf,x,0,0,.015,.014,.408);
 const linePts=[];const wx=.403,dz=.19;
 // Expanded steel mesh: clipped diagonal strands, with real open space.
 for(const slope of [-1,1])for(let b=-.61;b<=.61;b+=.011){const pts=[];for(const x of [-wx,wx]){let z=slope*x+b;if(z>=-dz&&z<=dz)pts.push(new T.Vector3(x,.001,z));}for(const z of [-dz,dz]){let x=(z-b)/slope;if(x>-wx&&x<wx)pts.push(new T.Vector3(x,.001,z));}if(pts.length>=2)linePts.push(pts[0],pts[1]);}
 const lattice=new T.LineSegments(new T.BufferGeometry().setFromPoints(linePts),new T.LineBasicMaterial({color:0x454b40}));shelf.add(lattice);
 const top=part('Столешница',crown,[0,.462,0]);const shape=new T.Shape();const w=.9,d=.46,r=.003;shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
 const topGeo=new T.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.001,bevelThickness:.001});topGeo.rotateX(-Math.PI/2);topGeo.translate(0,-.009,0);
 const uv=topGeo.getAttribute('uv'),ps=topGeo.getAttribute('position'),ns=topGeo.getAttribute('normal');
 for(let i=0;i<ps.count;i++){if(Math.abs(ns.getY(i))>.5)uv.setXY(i,ps.getX(i)/w+.5,ps.getZ(i)/d+.5);else uv.setXY(i,Math.abs(ns.getX(i))>.5?ps.getZ(i)/d+.5:ps.getX(i)/w+.5,(ps.getY(i)+.009)/.018);}
 uv.needsUpdate=true;mesh(topGeo,wood,top);
 const topFrame=part('Верхняя рама',crown,[0,.439,0]);for(const z of [-.209,.209])beam(topFrame,0,0,z,.88,.022,.021);for(const x of [-.429,.429])beam(topFrame,x,0,0,.021,.022,.438);
 const woodPoints=[];for(const x of [-.34,0,.34])for(const z of [-.192,.192]){const tab=beam(topFrame,x,.012,z,.033,.003,.038,edge);woodPoints.push([x,.446,z]);}
 function bracket(parent,name,x,y,z,sx){const p=part(name,parent,[x,y,z]);const sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(-.084,0);sh.lineTo(-.084,-.014);sh.quadraticCurveTo(-.025,-.014,-.012,-.08);sh.lineTo(0,-.08);sh.closePath();const geo=new T.ExtrudeGeometry(sh,{depth:.003,bevelEnabled:true,bevelSegments:1,bevelThickness:.0005,bevelSize:.0005});const m=mesh(geo,steel,p);m.scale.x=sx;p.userData.sign=sx;return p;}
 function screw(kind='107616'){const g=new T.Group();let length=kind==='152497'?.017:.018;let rad=kind==='152526'?.004:kind==='152527'?.003:.0034;
 mesh(new T.CylinderGeometry(rad,rad,length,14),boltMetal,g).position.y=length/2;
 const head=mesh(new T.CylinderGeometry(.0065,.0065,.003,28),boltMetal,g);head.position.y=-.0015;
 for(let i=0;i<7;i++){const ring=mesh(new T.TorusGeometry(rad,.00055,4,16),boltMetal,g);ring.rotation.x=Math.PI/2;ring.position.y=.002+i*(length/8);}
 const slot1=beam(g,0,-.00305,0,.0013,.00015,.007,dark);beam(g,0,-.00307,0,.007,.00015,.0013,dark);
 if(kind==='152497'){const cone=mesh(new T.ConeGeometry(rad,.007,12),boltMetal,g);cone.rotation.z=Math.PI;cone.position.y=length+.001;}
 g.userData.kind=kind;return g;}
 function fastener(parent,kind,pos,dir,group){const p=part(kind,parent,pos);p.add(screw(kind));p.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(...dir));p.userData.baseQ.copy(p.quaternion);p.userData.dir=new T.Vector3(...dir);p.userData.kind=kind;screws.push(p);group?.push(p);return p;}
 for(const sx of [-1,1])for(const sz of [-1,1]){
 const lo=bracket(chassis,'Нижний уголок',sx*.439,.133,sz*.221,sx);lo.rotation.z=Math.PI;lo.scale.x=-1;lo.userData.baseQ.copy(lo.quaternion);lower.push(lo);
 fastener(chassis,'107616',[sx*.402,.13,sz*.227],[0,0,-sz],lo.userData.bolts=[]);
 fastener(chassis,'107616',[sx*.430,.168,sz*.227],[0,0,-sz],lo.userData.bolts);
 for(const y of [.112,.147]){const bolt=fastener(chassis,'152527',[sx*.444,y,sz*.209],[-sx,0,0]);const sleeve=fastener(chassis,'152526',[sx*.412,y,sz*.209],[sx,0,0]);pairs.push([bolt,sleeve]);}
 const up=bracket(root,'Верхний уголок',sx*.440,.45,sz*.223,sx);upper.push(up);up.userData.bolts=[];
 for(const [dx,dy] of [[.020,.009],[.065,.009],[.009,.057]])fastener(root,'107616',[sx*(.440-dx),.45-dy,sz*.23],[0,0,-sz],up.userData.bolts);
 fastener(root,'107616',[sx*.444,.411,sz*.209],[-sx,0,0],mount);
 const foot=part('122158',root,[sx*.429,.015,sz*.209]);const disk=mesh(new T.CylinderGeometry(.013,.013,.009,40),dark,foot);for(let j=0;j<32;j++){const a=j/32*Math.PI*2;const ridge=beam(foot,Math.cos(a)*.0127,0,Math.sin(a)*.0127,.001,.008,.001,edge);}mesh(new T.CylinderGeometry(.004,.004,.027,16),boltMetal,foot).position.y=.016;foot.userData.kind='122158';foot.userData.dir=new T.Vector3(0,1,0);feet.push(foot);
 }
 woodPoints.forEach(p=>fastener(crown,'152497',p,[0,1,0],woodScrews));
 const driver=new T.Group();const shaft=mesh(new T.CylinderGeometry(.002,.002,.105,12),new T.MeshStandardMaterial({color:0xacae9d,metalness:.94,roughness:.22}),driver);shaft.position.y=-.059;const handle=mesh(new T.CylinderGeometry(.012,.009,.08,8),new T.MeshStandardMaterial({color:0xd95b2c,roughness:.48}),driver);handle.position.y=-.15;const handleEnd=mesh(new T.SphereGeometry(.009,16,8),handle.material,driver);handleEnd.position.y=-.19;driver.visible=false;root.add(driver);
 return {root,chassis,crown,parts,screws,sideFrames,shelf,top,topFrame,lower,upper,pairs,woodScrews,mount,feet,driver};
}
