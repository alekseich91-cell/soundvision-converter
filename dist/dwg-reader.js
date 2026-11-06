import createModule from './vendor/libredwg/wasm/libredwg-web.js';

const types = { 6:'SEQEND',7:'INSERT',8:'MINSERT',13:'VERTEX_PFACE',14:'VERTEX_PFACE_FACE',28:'3DFACE',29:'POLYLINE_PFACE',49:'BLOCK_HEADER' };
const fields = {
  BLOCK_HEADER:['name','base_pt','first_entity','last_entity'],
  INSERT:['block_header','ins_pt','scale','rotation','extrusion'],
  MINSERT:['block_header','ins_pt','scale','rotation','extrusion','num_cols','num_rows','col_spacing','row_spacing'],
  POLYLINE_PFACE:['numverts','numfaces'], VERTEX_PFACE:['point'],
  '3DFACE':['corner1','corner2','corner3','corner4'],
};
const point = p => p && typeof p === 'object' && 'x' in p ? [p.x,p.y,p.z ?? 0] : p;
export async function readDwg(bytes, options = {}) {
  const moduleOptions = { print:()=>{}, printErr:()=>{} };
  if (options.wasmBinary) moduleOptions.wasmBinary = options.wasmBinary;
  const m = await createModule(moduleOptions);
  let data;
  try {
    m.FS.writeFile('input.dwg', new Uint8Array(bytes));
    const result = m.dwg_read_file('input.dwg'); data = result.data;
    if (!data || (result.error & 0xff80)) throw new Error(`DWG не удалось прочитать полностью (код ${result.error}). Попробуйте пересохранить его в AutoCAD R2000/R2013.`);
    const count = m.dwg_get_num_objects(data);
    if (count > 1500000) throw new Error('В чертеже больше 1,5 млн объектов. Разделите модель на несколько файлов.');
    const records = [];
    const get = (tio,f) => { const r=m.dwg_dynapi_entity_value(tio,f); return r.success ? point(r.data) : undefined; };
    const refID = ptr => {
      if (!ptr) return null;
      const obj=m.dwg_ref_get_object(ptr);
      return obj ? String(m.dwg_object_get_handle_object(obj).value) : null;
    };
    for (let i=0;i<count;i++) {
      const obj=m.dwg_get_object(data,i), type=m.dwg_object_get_fixedtype(obj);
      const name=types[type] ?? m.dwg_object_get_dxfname(obj);
      const ent=m.dwg_object_to_entity(obj);
      if (!ent && type!==49) continue;
      const tio=ent ? m.dwg_object_to_entity_tio(obj) : m.dwg_object_to_object_tio(obj);
      const owner=ent ? m.dwg_object_entity_get_ownerhandle_object(ent) : m.dwg_object_object_get_ownerhandle_object(m.dwg_object_to_object(obj));
      const record={id:String(m.dwg_object_get_handle_object(obj).value),type:name,owner:String(owner?.absolute_ref ?? 0),model:ent ? m.dwg_object_entity_get_entmode(ent)===2 : false,hidden:ent ? !!m.dwg_object_entity_get_invisible(ent) : false};
      for (const f of fields[name] ?? []) record[f]=get(tio,f);
      if (name==='VERTEX_PFACE_FACE') {
        const off=m.dwg_dynapi_entity_field_offset(tio,'vertind');
        if (off<0) throw new Error('Не удалось прочитать индексы polyface-сетки.');
        record.indices=Array.from(m.HEAP16.slice((tio+off)/2,(tio+off)/2+4));
      }
      if (name==='INSERT' || name==='MINSERT') record.block=refID(record.block_header);
      if (name==='BLOCK_HEADER') {record.first=refID(record.first_entity);record.last=refID(record.last_entity);}
      if (ent && !['VERTEX_PFACE','VERTEX_PFACE_FACE','SEQEND'].includes(name)) {
        const layer=m.dwg_object_entity_get_layer_object_ref(ent);
        if (layer?.obj) {
          const lt=m.dwg_object_to_object_tio(layer.obj);
          record.layer=get(lt,'name') ?? '0';
          record.hidden ||= !!get(lt,'off') || !!get(lt,'frozen');
        }
      }
      records.push(record);
    }
    const unit=m.dwg_dynapi_header_value(data,'INSUNITS');
    return {records,unitCode:unit.success ? unit.data : 0,readWarning:result.error};
  } finally {
    if (data) m.dwg_free(data);
    if (m.FS.analyzePath('input.dwg').exists) m.FS.unlink('input.dwg');
  }
}
