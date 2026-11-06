export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=a=>Math.hypot(...a);
export function normal(p) { return p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n.map((v,k)=>v+(a[(k+1)%3]-b[(k+1)%3])*(a[(k+2)%3]+b[(k+2)%3]));},[0,0,0]); }
export const area=p=>length(normal(p))/2;
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=Math.floor(i/4),c=i%4;return [0,1,2,3].reduce((s,k)=>s+a[r*4+k]*b[k*4+c],0);});
const transform=(m,p)=>[0,1,2].map(r=>m[r*4]*p[0]+m[r*4+1]*p[1]+m[r*4+2]*p[2]+m[r*4+3]);
function insertMatrix(r,base,col=0,row=0) {
  const z=r.extrusion ?? [0,0,1],zn=length(z); if(zn<1e-12) throw new Error('У блока некорректная ось вставки.');
  const nz=z.map(v=>v/zn);let x=cross(Math.abs(nz[0])<1/64 && Math.abs(nz[1])<1/64 ? [0,1,0] : [0,0,1],nz);x=x.map(v=>v/length(x));const y=cross(nz,x);
  const a=r.rotation??0,c=Math.cos(a),s=Math.sin(a),sc=r.scale??[1,1,1],ins=r.ins_pt??[0,0,0];
  const offset=[col*(r.col_spacing??0),row*(r.row_spacing??0),0];
  const rotScale=[c*sc[0],-s*sc[1],0,c*offset[0]-s*offset[1],s*sc[0],c*sc[1],0,s*offset[0]+c*offset[1],0,0,sc[2],0,0,0,0,1];
  const ocs=[x[0],y[0],nz[0],0,x[1],y[1],nz[1],0,x[2],y[2],nz[2],0,0,0,0,1];
  const shift=identity.slice();shift[3]=ins[0];shift[7]=ins[1];shift[11]=ins[2];
  const origin=identity.slice();origin[3]=-base[0];origin[7]=-base[1];origin[11]=-base[2];
  return multiply(ocs,multiply(shift,multiply(rotScale,origin)));
}
export function extractGeometry(db) {
  const {records}=db,byID=new Map(records.map(r=>[r.id,r])),owned=new Map(),meshByID=new Map();
  const stats={hidden:0,degenerate:0,unsupported:{}}; const groups=[];
  for(const r of records){if(!owned.has(r.owner))owned.set(r.owner,[]);owned.get(r.owner).push(r);}
  for(let i=0;i<records.length;i++){
    const r=records[i];if(r.type!=='POLYLINE_PFACE')continue;
    let members=(owned.get(r.id)??[]).filter(v=>v.type==='VERTEX_PFACE'||v.type==='VERTEX_PFACE_FACE');
    if(!members.length){members=[];for(let j=i+1;j<records.length && records[j].type!=='SEQEND';j++)members.push(records[j]);}
    const vertices=members.filter(v=>v.type==='VERTEX_PFACE').map(v=>v.point),faces=members.filter(v=>v.type==='VERTEX_PFACE_FACE').map(v=>v.indices.filter(n=>n!==0).map(n=>Math.abs(n)-1));
    if(vertices.length!==r.numverts || faces.length!==r.numfaces)throw new Error(`Сетка ${r.id}: неполные данные вершин или граней.`);
    meshByID.set(r.id,{vertices,faces});
  }
  let budget=0;
  function visit(list,matrix,source,path,stack) {
    for(const r of list){
      if(r.hidden){stats.hidden++;continue;}
      if(r.type==='INSERT'||r.type==='MINSERT'){
        const block=byID.get(r.block);if(!block)throw new Error('В чертеже отсутствует определение одного из блоков.');
        if(stack.includes(r.block)||stack.length>32)throw new Error('Обнаружена циклическая или слишком глубокая вложенность блоков.');
        let children=owned.get(r.block)??[];
        if(!children.length&&block.first){const first=records.findIndex(v=>v.id===block.first),last=records.findIndex(v=>v.id===block.last);if(first>=0&&last>=first)children=records.slice(first,last+1);}
        const cols=r.num_cols||1,rows=r.num_rows||1;
        if(cols*rows>5000)throw new Error('Слишком много повторов в массиве блоков. Разделите чертёж.');
        for(let col=0;col<cols;col++)for(let row=0;row<rows;row++)visit(children,multiply(matrix,insertMatrix(r,block.base_pt??[0,0,0],col,row)),source==='Model' ? (block.name||'Block') : source,`${path}/${block.name||r.block}`,stack.concat(r.block));
        continue;
      }
      let vertices,faces;
      if(r.type==='POLYLINE_PFACE')({vertices,faces}=meshByID.get(r.id));
      else if(r.type==='3DFACE') {vertices=[r.corner1,r.corner2,r.corner3];if(r.corner4&&length(sub(r.corner3,r.corner4))>1e-9)vertices.push(r.corner4);faces=[vertices.map((_,i)=>i)];}
      else {if(!['VERTEX_PFACE','VERTEX_PFACE_FACE','SEQEND','BLOCK','ENDBLK','ATTRIB','ATTDEF','BLOCK_HEADER'].includes(r.type))stats.unsupported[r.type]=(stats.unsupported[r.type]??0)+1;continue;}
      const output=[];
      for(const indices of faces){
        if(indices.some(i=>i<0||i>=vertices.length))throw new Error('В сетке есть ссылка на отсутствующую вершину.');
        const p=indices.map(i=>transform(matrix,vertices[i]));
        if(p.length<3||p.some(v=>v.some(c=>!Number.isFinite(c))))throw new Error('Некорректные координаты грани.');
        const edge=Math.max(...p.map((v,i)=>length(sub(v,p[(i+1)%p.length]))));
        if(area(p)<=Math.max(1e-16,edge*edge*1e-12)){stats.degenerate++;continue;}
        output.push(p);if(++budget>300000)throw new Error('Больше 300 000 граней. Упростите модель перед конвертацией.');
      }
      if(output.length)groups.push({id:`g${groups.length}`,label:`${r.layer&&r.layer!=='0'?r.layer+' / ':''}Mesh ${r.id}`,source,path,faces:output});
    }
  }
  visit(records.filter(r=>r.model),identity,'Model','',[]);
  if(!groups.length)throw new Error('В DWG не найдены поверхности Polyface или 3DFACE. Линии плана сами по себе не задают пол и стены. 3DSOLID нужно предварительно преобразовать в сетку.');
  return {groups,stats,unitCode:db.unitCode,readWarning:db.readWarning};
}

export function mergePlanar(faces) {
  if(faces.length<2)return faces;
  // A single boundary is safe only for a consistently oriented, coplanar mesh.
  const first=faces.find(p=>area(p)>1e-14);if(!first)return [];
  const n=normal(first),nl=length(n),base=first[0];
  const limits=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
  for(const face of faces)for(const p of face)for(let i=0;i<3;i++){limits[i][0]=Math.min(limits[i][0],p[i]);limits[i][1]=Math.max(limits[i][1],p[i]);}
  const extent=Math.max(...limits.map(([a,b])=>b-a));
  const tolerance=Math.max(1e-8,extent*1e-8);
  if(faces.some(f=>dot(normal(f),n)<=0||f.some(p=>Math.abs(dot(sub(p,base),n))/nl>tolerance)))return faces;
  const vertices=[],ids=new Map(),edges=new Map();
  const id=p=>{const key=p.map(c=>Math.round(c/tolerance)).join(',');if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(p);}return ids.get(key);};
  for(const face of faces){const ring=face.map(id);for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a===b)continue;const key=[a,b].sort((a,b)=>a-b).join(',');const e=edges.get(key)??{a,b,count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}}
  if([...edges.values()].some(e=>e.count>2||(e.count===2&&e.balance!==0)))return faces;
  const adj=new Map();let edgeCount=0;
  for(const e of edges.values())if(e.count===1){if(adj.has(e.a))return faces;adj.set(e.a,e.b);edgeCount++;}
  if(edgeCount<3)return faces;
  const start=adj.keys().next().value,ring=[],visited=new Set();let cur=start;
  do{if(cur===undefined||visited.has(cur))return faces;visited.add(cur);ring.push(cur);cur=adj.get(cur);}while(cur!==start);
  // Extra boundary loops are holes; retain the original faces instead of filling them.
  if(ring.length!==edgeCount)return faces;
  let polygon=ring.map(i=>vertices[i]),changed=true;
  while(changed&&polygon.length>3){changed=false;for(let i=0;i<polygon.length;i++){const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i],c=polygon[(i+1)%polygon.length],ac=sub(c,a),ab=sub(b,a),l=dot(ac,ac);const t=l?dot(ab,ac)/l:-1;if(t>=0&&t<=1&&length(cross(ab,ac))/Math.sqrt(l)<tolerance){polygon.splice(i,1);changed=true;break;}}}
  const originalArea=faces.reduce((s,f)=>s+area(f),0);
  if(Math.abs(area(polygon)-originalArea)>Math.max(1e-8,originalArea*1e-7))return faces;
  return [polygon];
}

export function convertGeometry(model,{scale=0.001,merge=true,excludedSources=[],excludedGroups=[]}={}) {
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Некорректный масштаб.');
  const groups=model.groups.filter(g=>!excludedSources.includes(g.source)&&!excludedGroups.includes(g.id));
  if(!groups.length)throw new Error('Выберите хотя бы один объект для экспорта.');
  const scaled=groups.map(g=>({...g,faces:g.faces.map(f=>f.map(p=>p.map(c=>c*scale)))}));
  let minZ=Infinity;for(const g of scaled)for(const f of g.faces)for(const p of f)minZ=Math.min(minZ,p[2]);
  let floor=0,wall=0,original=0;const output=[];
  for(const group of scaled){
    original+=group.faces.length;
    const isFloor=group.faces.every(f=>f.every(p=>Math.abs(p[2]-minZ)<1e-5));
    const label=isFloor?`Floor ${++floor}`:`Surface ${++wall}`;
    const faces=merge?mergePlanar(group.faces):group.faces;
    for(let pts of faces){if(isFloor&&normal(pts)[2]<0)pts=[...pts].reverse();output.push({label,source:group.source,points:pts});}
  }
  const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
  for(const f of output)for(const p of f.points)for(let i=0;i<3;i++){bounds[i][0]=Math.min(bounds[i][0],p[i]);bounds[i][1]=Math.max(bounds[i][1],p[i]);}
  const header=['"; VECTORWORKS"','";"','";   using Outside is front (white)"','";   using Name By Layer"','";   using Visible Entities"','";"','";"','";"','"; LengthUnit","m"','";"'];
  const lines=[...header];
  for(const face of output){lines.push(`"Label","${face.label} face"`);for(const p of face.points)lines.push(p.map(v=>(Math.abs(v)<0.0000005?0:v).toFixed(6)).join(','));lines.push('";"');}
  return {text:lines.join('\n')+'\n',faces:output,bounds,originalFaces:original,surfaceCount:output.length,groupCount:groups.length};
}
