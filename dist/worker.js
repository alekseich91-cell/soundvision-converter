import {readDwg} from './dwg-reader.js';
import {extractGeometry,convertGeometry} from './geometry.js';
let model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='read'){
      const db=await readDwg(data.bytes);model=extractGeometry(db);
      self.postMessage({type:'loaded',groups:model.groups.map(({id,label,source,faces})=>({id,label,source,count:faces.length})),stats:model.stats,unitCode:model.unitCode,readWarning:model.readWarning});
    }else if(data.type==='convert'){
      if(!model)throw new Error('Сначала выберите DWG.');
      self.postMessage({type:'result',request:data.request,result:convertGeometry(model,data.options)});
    }
  }catch(error){self.postMessage({type:'error',request:data.request,message:error.message||'Не удалось обработать чертёж.'});}
};
