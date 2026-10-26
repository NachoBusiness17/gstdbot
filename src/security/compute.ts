/** Shared by HTTP inference and assigned platform work in this process. */
let active=0;
export class ComputeCapacityError extends Error {
    constructor(){super('Compute capacity reached; retry later');this.name='ComputeCapacityError';}
}
export function computeLoad(){
 const capacity=Math.max(1,Math.min(4,Math.trunc(Number(process.env.GSTD_MAX_INFERENCE_CONCURRENCY)||1)));
 return {active,capacity};
}
export function computeCapacityAvailable(){
 const capacity=Math.max(1,Math.min(4,Math.trunc(Number(process.env.GSTD_MAX_INFERENCE_CONCURRENCY)||1)));
 return active<capacity;
}
export async function withComputeSlot<T>(work:()=>Promise<T>):Promise<T>{
    if(!computeCapacityAvailable())throw new ComputeCapacityError();
    active++;
    try{return await work();}finally{active--;}
}
