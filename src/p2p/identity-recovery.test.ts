import {it,expect} from 'vitest';
import {mkdtempSync,cpSync,unlinkSync,readFileSync,writeFileSync,statSync,rmSync} from 'fs';
import {join} from 'path';import {tmpdir} from 'os';
import {loadOrCreateAttestorIdentity} from './identity.js';
import {loadOrCreateP2PIdentity} from './p2p-identity.js';
it('restores both signing and transport identity without replacing corrupt originals',async()=>{
 const root=mkdtempSync(join(tmpdir(),'gstd-restore-'));const live=join(root,'live'),backup=join(root,'backup');
 try{
  const a=loadOrCreateAttestorIdentity(live),p=await loadOrCreateP2PIdentity(live);
  cpSync(live,backup,{recursive:true});
  for(const file of ['attestor-identity.json','p2p-identity.json']){unlinkSync(join(live,file));cpSync(join(backup,file),join(live,file));}
  expect(loadOrCreateAttestorIdentity(live).pubkeyHex).toBe(a.pubkeyHex);
  expect((await loadOrCreateP2PIdentity(live)).pubkeyHex).toBe(p.pubkeyHex);
  if(process.platform!=='win32')expect(statSync(join(live,'attestor-identity.json')).mode&0o777).toBe(0o600);
  for(const file of ['attestor-identity.json','p2p-identity.json'])writeFileSync(join(live,file),'{broken');
  expect(()=>loadOrCreateAttestorIdentity(live)).toThrow();
  await expect(loadOrCreateP2PIdentity(live)).rejects.toThrow(/corrupt/);
  expect(readFileSync(join(live,'p2p-identity.json'),'utf8')).toBe('{broken');
 }finally{rmSync(root,{recursive:true,force:true});}
});
