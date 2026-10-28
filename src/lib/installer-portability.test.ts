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

it('writes escaped configuration without Python and preserves existing settings and identity',()=>{
 const source=readFileSync('install.sh','utf8');
 const script=source.split("node <<'NODECONFIG'\n")[1].split('\nNODECONFIG')[0];
 const dir=mkdtempSync(join(tmpdir(),'gstd-installer-config-')),file=join(dir,'config.json');
 writeFileSync(file,JSON.stringify({nodeId:'existing-id',custom:{preserved:true},dashboard:{host:'127.0.0.1'},installedAt:'original'}));
 const env={...process.env,GSTD_CFG_FILE:file,GSTD_CFG_VERSION:'test',GSTD_CFG_MODE:'sovereign',GSTD_CFG_ID:'existing-id',GSTD_CFG_NAME:'Node "quoted"',GSTD_CFG_INSTALL:join(dir,'space path'),GSTD_CFG_API:'https://example.test/api/v1',GSTD_CFG_PORT:'8080'};
 execFileSync(process.execPath,['-e',script],{env});
 expect(JSON.parse(readFileSync(file,'utf8'))).toMatchObject({nodeId:'existing-id',nodeName:'Node "quoted"',custom:{preserved:true},dashboard:{host:'127.0.0.1',port:8080},installedAt:'original'});
 writeFileSync(file,'invalid json');
 expect(()=>execFileSync(process.execPath,['-e',script],{env,stdio:'pipe'})).toThrow();
 expect(readFileSync(file,'utf8')).toBe('invalid json');
});
it.skipIf(process.platform==='win32')('supports a minimal root environment without invoking an absent sudo binary',()=>{
 const source=readFileSync('install.sh','utf8');
 const fn=source.slice(source.indexOf('sudo() {'),source.indexOf('\nVERSION='));
 expect(()=>execFileSync('bash',['-c','id(){ echo 0; };\n'+fn+'\nsudo -n true; sudo -E true'],{stdio:'pipe'})).not.toThrow();
});
it.skipIf(process.platform==='win32')('restart stops after a successful managed service restart',()=>{
 const source=readFileSync('install.sh','utf8');
 const branch=source.slice(source.indexOf('    restart)\n'),source.indexOf('    status)')).replaceAll('\\$','$');
 const dir=mkdtempSync(join(tmpdir(),'gstd-installer-restart-')),log=join(dir,'calls');
 execFileSync('bash',['-c','systemctl(){ echo service >> "'+log+'"; }; pm2(){ echo duplicate >> "'+log+'"; }; node(){ echo duplicate >> "'+log+'"; }; SYS_CMD=systemctl; case restart in\n'+branch+'\nesac']);
 expect(readFileSync(log,'utf8').trim()).toBe('service');
});
it('parses inline env comments and preserves explicit runtime overrides',()=>{
 const source=readFileSync('ecosystem.config.js','utf8');
 const fn=source.slice(source.indexOf('function loadEnv('),source.indexOf('// ─── Dynamic paths'));
 const dir=mkdtempSync(join(tmpdir(),'gstd-env-parser-')),file=join(dir,'.env');
 writeFileSync(file,'GSTD_FIXTURE_URL=https://example.test # comment\nGSTD_FIXTURE_OVERRIDE=file\n');
 const output=execFileSync(process.execPath,['-e','const fs=require("fs");\n'+fn+'\nconsole.log(JSON.stringify(loadEnv(process.argv[1])))',file],{encoding:'utf8',env:{...process.env,GSTD_FIXTURE_OVERRIDE:'runtime'}});
 expect(JSON.parse(output)).toEqual({GSTD_FIXTURE_URL:'https://example.test',GSTD_FIXTURE_OVERRIDE:'runtime'});
});
it.skipIf(process.platform==='win32')('OS detection does not overwrite the application version',()=>{
 const source=readFileSync('install.sh','utf8');
 const section=source.slice(source.indexOf('OS="unknown";'),source.indexOf('# Detect WSL'));
 const out=execFileSync('bash',['-eu','-c','VERSION=gstd-test-version;\n'+section+'\nprintf "%s" "$VERSION"'],{encoding:'utf8'});
 expect(out).toBe('gstd-test-version');
});
it.skipIf(process.platform==='win32')('finishes successfully without a separate tunnel process',()=>{
 const source=readFileSync('install.sh','utf8');
 const section=source.slice(source.indexOf('# Try to find the Cloudflare tunnel URL'),source.indexOf('# Local LAN IP'));
 const out=execFileSync('bash',['-euo','pipefail','-c','pm2(){ return 1; };\n'+section+'\nprintf "finished"'],{encoding:'utf8'});
 expect(out).toBe('finished');
});

it.skipIf(process.platform==='win32')('tunnel paths work outside the original production account',()=>{
 const source=readFileSync('tunnel.sh','utf8').split('while true; do')[0];
 const dir=mkdtempSync(join(tmpdir(),'gstd-tunnel-install-'));
 writeFileSync(join(dir,'cloudflared'),'fixture');
 const home=join(dir,'different home');
 const output=execFileSync('bash',['-eu','-c',source+'\nprintf "%s\\n" "$URL_FILE" "$LOG" "$CF_BIN"',join(dir,'tunnel.sh')],{
  encoding:'utf8',env:{...process.env,HOME:home,GSTD_CONFIG_DIR:'',GSTD_TUNNEL_URL_FILE:''},
 });
 expect(output.trim().split('\n')).toEqual([join(home,'.config/gstdbot/tunnel-url.txt'),join(dir,'logs/tunnel.log'),join(dir,'cloudflared')]);
});
