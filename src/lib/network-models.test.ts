import {it,expect,vi,afterEach} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules()});
it('shares concurrent reads, caches them and rejects invalid prices',async()=>{
 const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({models:[{model_id:'valid:1b',nodes_count:2,price_gstd:0.01},{model_id:'bad',nodes_count:1,price_gstd:-1}]})));
 vi.stubGlobal('fetch',request);const {networkModels}=await import('./network-models.js');
 const [a,b]=await Promise.all([networkModels('https://example.test'),networkModels('https://example.test')]);
 expect(a).toEqual(b);expect(a?.models).toEqual([{model_id:'valid:1b',nodes_count:2,price_gstd:0.01}]);
 await networkModels('https://example.test');expect(request).toHaveBeenCalledTimes(1);
});
it('reports unknown availability when the registry fails instead of reusing stale claims',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));const {networkModels}=await import('./network-models.js');
 expect(await networkModels('https://example.test')).toBeNull();
});
