import {describe,it,expect} from 'vitest';
import {compatibility,modelCatalog,type CatalogHardware} from './model-catalog.js';
const GiB=1024**3;
const hardware:CatalogHardware={total_ram:8*GiB,available_ram:6*GiB,disk_free:20*GiB,cpu_cores:4,gpu_vram:0,gpu_name:null,local_runtime:true,platform:'linux',arch:'arm64'};
const model={id:'test:1b',title:'Test',category:'general',legacy:false,download_bytes:GiB,verified_at:'2026-10-27',source:'https://ollama.com'};
describe('model resource planning',()=>{
 it('offers small CPU models while refusing oversized models and disk shortages',()=>{
  expect(compatibility(model,hardware).status).toBe('fits');
  expect(compatibility({...model,download_bytes:10*GiB},hardware)).toMatchObject({status:'insufficient',reason:'memory'});
  expect(compatibility(model,{...hardware,disk_free:GiB})).toMatchObject({status:'insufficient',reason:'disk'});
 });
 it('distinguishes currently busy RAM from insufficient total RAM',()=>{
  expect(compatibility(model,{...hardware,available_ram:GiB})).toMatchObject({status:'tight',reason:'close_models'});
 });
 it('does not claim compatibility from the gateway hardware when Ollama is remote',()=>{
  expect(compatibility(model,{...hardware,local_runtime:false})).toMatchObject({status:'unknown',reason:'remote_runtime'});
 });
 it('contains reviewed downloadable local IDs and verified sizes, including current and low-resource models',()=>{
  const list=modelCatalog();expect(list.length).toBeGreaterThanOrEqual(10);
  expect(list.some(m=>m.id==='qwen3.5:0.8b')).toBe(true);
  expect(list.some(m=>m.id==='gemma4:e2b')).toBe(true);
  for(const m of list){expect(m.id).not.toMatch(/cloud/i);expect(m.download_bytes).toBeGreaterThan(0);expect(Date.parse(m.verified_at)).toBeGreaterThan(0);}
 });
});
