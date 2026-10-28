import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
vi.mock('../gateway/server.js',()=>({logActivity:vi.fn()}));
import {NodeWallet} from './manager.js';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllTimers();vi.useRealTimers();});
it.each(['{broken','null','{}','{"address":42}','{"address":"invalid"}'])('preserves a corrupt saved wallet and fails closed (%s)',async(saved)=>{
 const directory=mkdtempSync(join(tmpdir(),'gstd-wallet-corrupt-')),file=join(directory,'wallet.json');
 try{
  writeFileSync(file,saved,{mode:0o600});
  vi.stubEnv('GSTD_WALLET_ADDRESS','0:'+'44'.repeat(32));
  await expect(new NodeWallet({} as any,directory).init()).rejects.toThrow('Refusing to replace');
  expect(readFileSync(file,'utf8')).toBe(saved);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('loads an offline restored wallet without replacing its reward address or public metadata',async()=>{
 vi.useFakeTimers();
 const root=mkdtempSync(join(tmpdir(),'gstd-wallet-restore-')),backup=join(root,'backup.json'),file=join(root,'wallet.json');
 try{
  const saved=JSON.stringify({address:'0:'+'33'.repeat(32),publicKey:'public-only-fixture',created:'original',linkedExternalWallet:'0:'+'55'.repeat(32)});
  writeFileSync(backup,saved,{mode:0o600});cpSync(backup,file);
  const wallet=new NodeWallet({} as any,root);
  vi.spyOn(wallet as any,'refreshBalance').mockResolvedValue(undefined);
  await wallet.init();
  expect(wallet.getAddress()).toBe('0:'+'33'.repeat(32));
  expect(wallet.getRewardAddress()).toBe('0:'+'55'.repeat(32));
  expect(readFileSync(file,'utf8')).toBe(saved);
 }finally{rmSync(root,{recursive:true,force:true});}
});
