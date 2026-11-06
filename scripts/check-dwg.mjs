import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readDwg} from '../dist/dwg-reader.js';
import {extractGeometry,convertGeometry,area} from '../dist/geometry.js';
const input=process.argv[2];if(!input)throw new Error('Pass local DWG fixture path');
const db=await readDwg(fs.readFileSync(input),{wasmBinary:fs.readFileSync(new URL('../dist/vendor/libredwg/wasm/libredwg-web.wasm',import.meta.url))});
const model=extractGeometry(db);
console.log('Parsed DWG:',db.records.length,'records;',model.groups.length,'geometry objects; sources:',[...new Set(model.groups.map(g=>g.source))]);
const result=convertGeometry(model,{excludedSources:['HEATHER']});
assert.equal(result.text.split('\n')[0],'"; VECTORWORKS"');assert.ok(result.faces.every(f=>f.points.length>=3));
assert.equal(result.surfaceCount,9);assert.equal(result.groupCount,9);assert.ok(result.originalFaces>=28 && result.originalFaces<=30);
assert.ok(Math.abs(area(result.faces.find(f=>f.label.startsWith('Floor')).points)-184.70691196824404)<1e-7);
assert.ok(Math.abs(result.bounds[0][1]-result.bounds[0][0]-25.884306)<1e-5);
// Compare every coordinate and polygon area with the successfully imported export.
if(process.env.SV_REFERENCE){
  const rows=fs.readFileSync(process.env.SV_REFERENCE,'utf8').split(/\r?\n/);const reference=[];
  for(const row of rows){if(row.startsWith('"Label"'))reference.push([]);else if(/^[-\d]/.test(row))reference.at(-1).push(row.split(',').map(Number));}
  const canonical=p=>p.map(v=>v.map(c=>c.toFixed(6)).join(',')).sort().join(';');
  assert.deepEqual(result.faces.map(f=>canonical(f.points)).sort(),reference.map(canonical).sort());
  console.log('MATCH: all 9 polygon boundaries match the file imported successfully in Soundvision.');
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/regression-export.txt',result.text);
console.log('PASS: 9 surfaces, 184.706912 m² floor, 25.884306 m overall X span.');
