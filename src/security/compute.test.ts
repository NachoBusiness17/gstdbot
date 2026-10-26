import {it,expect} from 'vitest';
import {withComputeSlot,ComputeCapacityError,computeLoad} from './compute.js';
it('holds a shared slot until actual computation completes and releases after success/failure',async()=>{
 let release!:()=>void;
 expect(computeLoad()).toEqual({active:0,capacity:1});
 const held=withComputeSlot(()=>new Promise<void>(resolve=>{release=resolve;}));
 expect(computeLoad()).toEqual({active:1,capacity:1});
 await expect(withComputeSlot(async()=>1)).rejects.toBeInstanceOf(ComputeCapacityError);
 release();await held;
 await expect(withComputeSlot(async()=>{throw new Error('model failed');})).rejects.toThrow('model failed');
 await expect(withComputeSlot(async()=>7)).resolves.toBe(7);
});
