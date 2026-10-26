import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'fs';
import {join} from 'path';
import {randomBytes} from 'crypto';
/** First-run bootstrap only. Never print, replace a corrupt file or alter an existing PIN. */
export function setupTokenFor(directory:string,configured:boolean,provided:string|undefined):string{
 if(configured)return '';
 if(provided){if(Buffer.byteLength(provided,'utf8')<32)throw Error('Invalid configured setup token');return provided;}
 mkdirSync(directory,{recursive:true,mode:0o700});
 const file=join(directory,'setup-token');
 if(existsSync(file)){const value=readFileSync(file,'utf8').trim();if(Buffer.byteLength(value,'utf8')<32)throw Error('Invalid saved setup token; restore or configure it explicitly');return value;}
 const value=randomBytes(32).toString('hex');
 try{writeFileSync(file,value+'\n',{mode:0o600,flag:'wx'});}
 catch(error:any){if(error.code==='EEXIST')return setupTokenFor(directory,false,undefined);throw error;}
 return value;
}
