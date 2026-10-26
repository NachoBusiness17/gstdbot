import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
it.skipIf(process.platform==='win32')('installer identifies supported 64-bit systems and rejects unsupported combinations',()=>{
 const source=readFileSync('install.sh','utf8');
 const fn=source.slice(source.indexOf('platform_supported()'),source.indexOf('check_environment()'));
 const check=(system:string,arch:string)=>{try{execFileSync('bash',['-c',fn+'\nplatform_supported "$1" "$2"','check',system,arch]);return true;}catch{return false;}};
 expect(check('Linux','x86_64')).toBe(true);expect(check('Linux','aarch64')).toBe(true);
 expect(check('Darwin','arm64')).toBe(true);
 expect(check('Linux','armv7l')).toBe(false);expect(check('Windows_NT','AMD64')).toBe(false);
});
it.skipIf(process.platform==='win32')('cluster plan validates all hosts before using SSH and does not require a live cluster',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gstd-cluster-plan-')),file=join(dir,'hosts.txt'),wallet='0:'+'55'.repeat(32);
 writeFileSync(file,'operator@server-a\nserver-b\n');
 const out=execFileSync('bash',['scripts/install-cluster.sh','--hosts',file,'--wallet',wallet,'--plan'],{encoding:'utf8'});
 expect(out).toContain('Independent nodes: 2');expect(out).toContain('Host: server-b');
 writeFileSync(file,'server-a\n-oProxyCommand=unsafe\n');
 expect(()=>execFileSync('bash',['scripts/install-cluster.sh','--hosts',file,'--wallet',wallet,'--plan'],{stdio:'pipe'})).toThrow();
});
