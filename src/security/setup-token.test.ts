import {it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupTokenFor} from './setup-token.js';
it('bootstraps an unattended node once, preserves its token and never resets existing access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gstd-setup-token-')),value=setupTokenFor(dir,false,undefined),file=join(dir,'setup-token');
 expect(value).toHaveLength(64);expect(setupTokenFor(dir,false,undefined)).toBe(value);
 if(process.platform!=='win32')expect(statSync(file).mode&0o777).toBe(0o600);
 expect(setupTokenFor(dir,true,undefined)).toBe('');expect(readFileSync(file,'utf8').trim()).toBe(value);
 const configuredDir=join(dir,'existing-pin');expect(setupTokenFor(configuredDir,true,undefined)).toBe('');expect(existsSync(configuredDir)).toBe(false);
});
it('refuses to overwrite a corrupt token and honors an explicit valid token',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gstd-corrupt-token-')),file=join(dir,'setup-token');
 writeFileSync(file,'corrupt',{mode:0o600});
 expect(()=>setupTokenFor(dir,false,undefined)).toThrow('Invalid saved setup token');
 expect(readFileSync(file,'utf8')).toBe('corrupt');
 expect(()=>setupTokenFor(dir,false,'short')).toThrow('Invalid configured setup token');
 expect(setupTokenFor(dir,false,'x'.repeat(40))).toBe('x'.repeat(40));
});
