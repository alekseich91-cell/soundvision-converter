const $=id=>document.getElementById(id);
let worker,groups=[],result,currentFile,request=0,downloadURL=null,timeout,unitTouched=false;
const exclusions=new Set();
const status=s=>$('status').textContent=s;
function invalidate(){request++;result=null;$('download').disabled=true;$('error').hidden=true;if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}}
function fail(message){clearTimeout(timeout);invalidate();$('busy').hidden=true;$('error').textContent=message;$('error').hidden=false;status('НЕ УДАЛОСЬ КОНВЕРТИРОВАТЬ');}
function stop(){worker?.terminate();worker=null;clearTimeout(timeout);invalidate();$('busy').hidden=true;}
async function load(file){
  if(!file)return;
  if(!/\.dwg$/i.test(file.name)){fail('Выбери файл с расширением .dwg.');return;}
  if(file.size>50*1024*1024){fail('Файл больше 50 МБ. Упрости чертёж или раздели его на части.');return;}
  stop();currentFile=file;groups=[];exclusions.clear();unitTouched=false;$('units').value='0.001';$('unit-hint').textContent='Если единицы не записаны в DWG, выбери их по известному размеру помещения.';
  $('file-name').textContent=file.name;$('file-detail').textContent=`${(file.size/1024/1024).toFixed(2)} МБ · нажми, чтобы заменить`;
  $('sources-wrap').hidden=true;$('result-info').hidden=true;$('empty').hidden=true;scene=[];draw();$('busy').hidden=false;$('busy-label').textContent='Читаю DWG…';status('ОБРАБОТКА ЧЕРТЕЖА');
  const active=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker=active;
  active.onerror=()=>{if(worker===active)fail('Не удалось запустить модуль конвертации. Проверь интернет при первом открытии или попробуй другой браузер.');};
  timeout=setTimeout(()=>{if(worker===active){stop();fail('Чтение заняло больше двух минут. Попробуй уменьшить размер чертежа.');}},120000);
  active.onmessage=({data})=>{
    if(worker!==active)return;
    if(data.type==='error'){if(data.request===undefined||data.request===request)fail(data.message);return;}
    if(data.type==='loaded'){
      clearTimeout(timeout);groups=data.groups;window.conversionStats=data.stats;
      const units={1:'0.0254',2:'0.3048',4:'0.001',5:'0.01',6:'1'};
      if(units[data.unitCode]&&!unitTouched){$('units').value=units[data.unitCode];$('unit-hint').textContent='Единицы взяты из DWG. Проверь их по известному размеру помещения.';}
      else $('unit-hint').textContent='Единицы в DWG не определены. Сейчас приняты миллиметры — проверь габариты модели.';
      populateSources(groups);$('busy-label').textContent='Объединяю поверхности…';reconvert();
    }else if(data.type==='result'&&data.request===request){
      result=data.result;$('busy').hidden=true;$('error').hidden=true;$('download').disabled=false;$('empty').hidden=true;$('result-info').hidden=false;$('axis-legend').hidden=false;$('viewer-help').hidden=false;
      const dim=result.bounds.map(([a,b])=>(b-a).toFixed(2).replace('.',','));$('dimensions').textContent=`${dim.join(' × ')} м`;
      $('counts').textContent=`${result.originalFaces} → ${result.surfaceCount}`;$('surface-count').textContent=`${result.surfaceCount} ПОВЕРХНОСТЕЙ`;status('ГОТОВО К СКАЧИВАНИЮ');
      const stats=window.conversionStats;const omitted=Object.entries(stats.unsupported).map(([t,n])=>`${t}: ${n}`).join(', ');
      $('warnings').textContent=[`Объектов выбрано: ${result.groupCount}.`,stats.hidden?`Скрытых объектов пропущено: ${stats.hidden}.`:'',stats.degenerate?`Вырожденных граней удалено: ${stats.degenerate}.`:'',omitted?`Не экспортируются: ${omitted}.`:'','Высоту ушей и расчётные поверхности задай в Soundvision.'].filter(Boolean).join(' ');
      scene=result.faces;fit();
    }
  };
  try{const bytes=await file.arrayBuffer();if(worker===active)active.postMessage({type:'read',bytes},[bytes]);}catch(e){if(worker===active)fail(e.message);}
}
function populateSources(items){
  const sources=new Map();for(const g of items){sources.set(g.source,(sources.get(g.source)??0)+g.count);}
  $('sources').replaceChildren();
  for(const [source,count] of sources){
    const label=document.createElement('label');label.className='source-row';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.source=source;
    const title=document.createElement('span');title.textContent=source==='Model'?'Основная модель':source;title.title=source;
    const number=document.createElement('small');number.textContent=`${count} граней`;
    input.addEventListener('change',()=>{input.checked?exclusions.delete(source):exclusions.add(source);reconvert();});label.append(input,title,number);$('sources').append(label);
  }
  $('sources-wrap').hidden=false;
}
function reconvert(){
  invalidate();if(!worker||!groups.length)return;
  if(groups.every(g=>exclusions.has(g.source))){fail('Выбери хотя бы одну группу объектов.');scene=[];draw();return;}
  status('ПОДГОТОВКА ГЕОМЕТРИИ');worker.postMessage({type:'convert',request,options:{scale:Number($('units').value),merge:$('merge').checked,excludedSources:[...exclusions]}});
}
$('file').addEventListener('change',e=>load(e.target.files[0]));
$('dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}});
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('drag');});
for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('drag');});
$('dropzone').addEventListener('drop',e=>load(e.dataTransfer.files[0]));
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('units').addEventListener('change',()=>{unitTouched=true;reconvert();});$('merge').addEventListener('change',reconvert);
$('cancel').addEventListener('click',()=>{stop();groups=[];$('empty').hidden=false;status('ОБРАБОТКА ОТМЕНЕНА');});
$('download').addEventListener('click',()=>{
  if(!result)return;if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=downloadURL;a.download=currentFile.name.replace(/\.dwg$/i,'').trim()+'-Soundvision.txt';a.click();status('TXT СКАЧАН · ИМПОРТИРУЙ В SOUNDVISION');
});

// Small local canvas renderer; no CAD geometry or filenames leave this page.
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let scene=[],yaw=-0.55,pitch=0.85,zoom=1,top=false,drag=null,center=[0,0,0],span=1;
function fit(){
  if(result){center=result.bounds.map(([a,b])=>(a+b)/2);span=Math.max(...result.bounds.map(([a,b])=>b-a),0.1);}
  zoom=1;draw();
}
function project(p,w,h){
  const a=p.map((v,i)=>(v-center[i])/span),c=Math.cos(yaw),s=Math.sin(yaw),x=a[0]*c-a[1]*s,y=a[0]*s+a[1]*c;
  const yy=top?-y:-y*Math.cos(pitch)-a[2]*Math.sin(pitch),depth=top?a[2]:y*Math.sin(pitch)-a[2]*Math.cos(pitch);
  const scale=Math.min(w*0.76,h*1.12)*zoom;
  return [w/2+x*scale,h/2+yy*scale,depth];
}
function draw(){
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#7394a010';ctx.lineWidth=1;
  for(let i=-12;i<=12;i++){ctx.beginPath();ctx.moveTo(0,h/2+i*26);ctx.lineTo(w,h/2+i*26);ctx.stroke();ctx.beginPath();ctx.moveTo(w/2+i*26,0);ctx.lineTo(w/2+i*26,h);ctx.stroke();}
  const displayed=scene.slice(0,20000).map(f=>({...f,p:f.points.map(p=>project(p,w,h))}));displayed.sort((a,b)=>b.p.reduce((s,p)=>s+p[2],0)/b.p.length-a.p.reduce((s,p)=>s+p[2],0)/a.p.length);
  for(const f of displayed){ctx.beginPath();f.p.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=f.label.startsWith('Floor')?'#b9e8883c':'#a1b5b535';ctx.strokeStyle=f.label.startsWith('Floor')?'#bce88cb0':'#a4c4cd9c';ctx.lineWidth=.85;ctx.fill();ctx.stroke();}
  if(scene.length>20000){ctx.fillStyle='#c2d2d8';ctx.font='11px sans-serif';ctx.fillText('Превью: первые 20 000 поверхностей. TXT содержит всю выбранную геометрию.',15,25);}
}
new ResizeObserver(draw).observe($('viewport'));
canvas.addEventListener('pointerdown',e=>{if(!scene.length)return;drag=[e.clientX,e.clientY,yaw,pitch];canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag[2]+(e.clientX-drag[0])*.008;if(!top)pitch=Math.max(.05,Math.min(1.55,drag[3]+(e.clientY-drag[1])*.008));draw();});
for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>{drag=null;canvas.style.cursor='grab';});
canvas.addEventListener('wheel',e=>{if(!scene.length)return;e.preventDefault();zoom=Math.max(.2,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});
function view(isTop){top=isTop;$('view-top').classList.toggle('active',top);$('view-3d').classList.toggle('active',!top);$('view-top').setAttribute('aria-pressed',String(top));$('view-3d').setAttribute('aria-pressed',String(!top));if(top)yaw=0;else{yaw=-.55;pitch=.85;}fit();}
$('view-top').addEventListener('click',()=>view(true));$('view-3d').addEventListener('click',()=>view(false));$('reset').addEventListener('click',()=>{yaw=top?0:-.55;pitch=.85;fit();});
window.addEventListener('pagehide',()=>{worker?.terminate();if(downloadURL)URL.revokeObjectURL(downloadURL);});
