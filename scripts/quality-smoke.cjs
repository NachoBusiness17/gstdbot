#!/usr/bin/env node
// Deterministic acceptance samples, not a general model quality benchmark.
const fs=require('node:fs');
const origin=process.env.GSTD_EVAL_URL || 'http://127.0.0.1:8080';
const cases=[
 {id:'arithmetic',prompt:'What is 17 + 28? Reply with digits only.',check:s=>s.trim()==='45'},
 {id:'extract',prompt:'Extract the email from: Contact Ada at ada@example.org. Reply with only the email address.',check:s=>s.trim()==='ada@example.org'},
 {id:'json',prompt:'Return a JSON object with exactly one key status and string value ok. Output only JSON.',check:s=>{try{return JSON.stringify(JSON.parse(s))===JSON.stringify({status:'ok'});}catch{return false;}}},
 {id:'filter',prompt:'Select the even numbers from [1,2,3,4,5,6]. Reply only with a JSON array of numbers.',check:s=>{try{return JSON.stringify(JSON.parse(s))==='[2,4,6]';}catch{return false;}}},
];
async function run(){
 const response=await fetch(origin+'/v1/models',{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Model discovery failed: '+response.status);
 const data=await response.json();
 const models=process.env.GSTD_EVAL_MODELS?.split(',') || data.data.filter(m=>m.owned_by==='local-ollama').map(m=>m.id);
 if(!models.length)throw new Error('No installed local models');
 const results=[];
 for(const model of models)for(const test of cases){
  const start=Date.now();let row;
  try{
   const r=await fetch(origin+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model,messages:[{role:'user',content:test.prompt}],max_tokens:48,temperature:0,privacy:'local'}),signal:AbortSignal.timeout(125000)});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const a=await r.json(),text=a.choices?.[0]?.message?.content || '';
   row={model,actual_model:a.model,case:test.id,passed:test.check(text),response:text.slice(0,500),latency_ms:Date.now()-start};
  }catch(error){row={model,case:test.id,passed:false,error:error.message,latency_ms:Date.now()-start};}
  results.push(row);console.log(JSON.stringify(row));
 }
 const report={timestamp:new Date().toISOString(),scope:'Four small deterministic samples per installed model; not a general quality guarantee',results};
 if(process.env.GSTD_EVAL_OUTPUT)fs.writeFileSync(process.env.GSTD_EVAL_OUTPUT,JSON.stringify(report,null,2));
 if(results.some(r=>!r.passed))process.exitCode=1;
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
