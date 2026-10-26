import {describe,it,expect} from 'vitest';
import {nodeOrigin,chatBody,cli} from './index.js';
describe('minimal compute CLI',()=>{
 it('uses local inference and requires an explicit network choice',()=>{
  expect(nodeOrigin()).toBe('http://127.0.0.1:8080');
  expect(chatBody('hello').privacy).toBe('local');
  expect(chatBody('hello','auto',true).privacy).toBe('network');
  expect(()=>chatBody('')).toThrow();
 });
 it('rejects credentialed or ambiguous node origins',()=>{
  for(const url of ['file:///tmp/x','https://user:password@example.test','https://example.test/path','https://example.test/?token=x'])expect(()=>nodeOrigin(url)).toThrow();
 });
 it('does not expose archived host, skill or autonomous-agent commands',()=>{
  expect(cli().commands.map(command=>command.name())).toEqual(['gateway','status','doctor','send','chat']);
 });
});
