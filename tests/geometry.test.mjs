import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePlanar,area,extractGeometry,convertGeometry,normal} from '../dist/geometry.js';
const model=faces=>({groups:[{id:'g0',source:'Model',faces}],stats:{}});
test('merges adjacent triangles and preserves area',()=>{
  const f=[[[0,0,0],[4,0,0],[4,3,0]],[[0,0,0],[4,3,0],[0,3,0]]];const merged=mergePlanar(f);
  assert.equal(merged.length,1);assert.equal(merged[0].length,4);assert.equal(area(merged[0]),12);
});
test('retains disconnected regions and holes rather than filling them',()=>{
  const f=[[[0,0,0],[1,0,0],[0,1,0]],[[3,0,0],[4,0,0],[3,1,0]]];assert.equal(mergePlanar(f).length,2);
  const pts=[[0,0,0],[3,0,0],[3,3,0],[0,3,0],[1,1,0],[2,1,0],[2,2,0],[1,2,0]];
  const rings=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(r=>r.map(i=>pts[i]));assert.equal(mergePlanar(rings).length,4);
  assert.equal(rings.reduce((s,p)=>s+area(p),0),8);
});
test('retains nonplanar and oppositely wound faces',()=>{
  const f=[[[0,0,0],[4,0,0],[4,3,0]],[[0,0,0],[4,3,0],[0,3,1]]];assert.equal(mergePlanar(f).length,2);
  f[1]=[[0,0,0],[0,3,0],[4,3,0]];assert.equal(mergePlanar(f).length,2);
});
test('preserves a concave doorway outline and its area',()=>{
  const p=[[4,0,4],[3,0,0],[4,0,0],[3,0,2],[1,0,2],[0,0,0],[1,0,0],[0,0,4]];
  const f=[[0,1,2],[1,0,3],[3,0,4],[4,5,6],[5,4,7],[7,4,0]].map(r=>r.map(i=>p[i]));const result=mergePlanar(f);assert.equal(result.length,1);assert.equal(result[0].length,8);assert.equal(area(result[0]),12);
});
test('uses Vectorworks header, metric scale and upward floor winding',()=>{
  const r=convertGeometry(model([[[0,0,0],[0,1000,0],[2000,0,0]]]));assert.equal(r.text.split('\n')[0],'"; VECTORWORKS"');assert.equal(area(r.faces[0].points),1);assert.ok(normal(r.faces[0].points)[2]>0);
  assert.deepEqual(r.bounds,[[0,2],[0,1],[0,0]]);assert.throws(()=>convertGeometry(model([[[0,0,0],[1,0,0],[0,1,0]]]),{excludedSources:['Model']}));
});
test('extracts visible blocks with scale, rotation and base point',()=>{
  const db={records:[{id:'b',type:'BLOCK_HEADER',name:'Room',base_pt:[10,0,0],owner:'0'},
    {id:'face',type:'3DFACE',owner:'b',corner1:[10,0,0],corner2:[11,0,0],corner3:[10,1,0]},
    {id:'i',type:'INSERT',model:true,owner:'0',block:'b',ins_pt:[5,6,0],scale:[2,2,1],rotation:Math.PI/2},
    {id:'hidden',type:'INSERT',model:true,owner:'0',block:'b',hidden:true}]};
  const result=extractGeometry(db);assert.equal(result.groups.length,1);assert.equal(result.stats.hidden,1);
  const p=result.groups[0].faces[0];for(let i=0;i<3;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(p[i][k]-[[5,6,0],[5,8,0],[3,6,0]][i][k])<1e-10);
});
test('rejects invalid indices and recursive blocks',()=>{
  assert.throws(()=>extractGeometry({records:[{id:'p',type:'POLYLINE_PFACE',model:true,owner:'0',numverts:1,numfaces:1},{id:'v',type:'VERTEX_PFACE',owner:'p',point:[0,0,0]},{id:'f',type:'VERTEX_PFACE_FACE',owner:'p',indices:[1,2,3,0]}]}),/отсутствующую/);
  assert.throws(()=>extractGeometry({records:[{id:'b',type:'BLOCK_HEADER',owner:'0'},{id:'i',type:'INSERT',model:true,owner:'b',block:'b'}]}),/циклическая/);
});
