const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('payloads/recover-manager.js', 'utf8');
const pointer = n => ({low:n >>> 0, add32(i) {return pointer(this.low+i);}});
async function run(options={}) {
  const bytes = new Uint8Array(0x1007); bytes.set([0x7f,0x45,0x4c,0x46]);
  for(let i=4;i<bytes.length;i++) bytes[i]=i&255;
  const memory=new Map(), sent=[], ports=[], closed=[];
  let next=0x20000000, unmapped=0, timeoutSet=false;
  const api={krw:null, log:async()=>{}, p:{
    malloc(size) {const p=pointer(next);next+=size;return p;},
    write1(p,n) {memory.set(p.low,n&255);},
    write4(p,n) {for(let i=0;i<4;i++) memory.set(p.low+i,(n>>>(8*i))&255);},
    read4(p) {return [0,1,2,3].reduce((n,i)=>n|(memory.get(p.low+i)<<(8*i)),0);}
  }, chain:{async syscall(n,...args) {
    if(n===0x61) return pointer(12);
    if(n===0x62) {
      const [fd,addr,size]=args;assert.equal(fd,12);assert.equal(size,16);
      const address=Array.from({length:8},(_,i)=>memory.get(addr.low+i));
      assert.deepEqual(address.slice(0,2),[16,2]);assert.deepEqual(address.slice(4),[127,0,0,1]);
      const port=(address[2]<<8)|address[3];ports.push(port);
      assert([8084,9021].includes(port));
      return pointer(port===8084 ? (options.managerRunning?0:-1) : (options.loaderFails?-1:0));
    }
    if(n===6) {closed.push(args[0]);return pointer(0);}
    if(n===0x69) {
      assert.deepEqual(args.slice(0,3),[12,0xffff,0x1005]);assert.equal(args[4],16);
      assert.equal(memory.get(args[3].low),5);timeoutSet=true;return pointer(options.timeoutFails?-1:0);
    }
    if(n===0x1dd) return pointer(options.mmapFails?-1:0x30000000);
    if(n===0x49) {unmapped++;return pointer(0);}
    if(n===4) {
      assert(timeoutSet);assert.equal(api.krw,null);
      if(options.writeFails) return pointer(-1);
      const count=Math.min(args[2],113);
      for(let i=0;i<count;i++) sent.push(memory.get(args[1].low+i));return pointer(count);
    }
    throw new Error('Unexpected syscall '+n);
  }}};
  const sandbox={DataView,fetch:async name=>{
    assert.equal(name,'pldmgr.elf');return {ok:!options.fetchFails,arrayBuffer:async()=>options.badElf?new ArrayBuffer(8):bytes.buffer};
  }};
  const fn=await vm.runInNewContext('(async function(){'+source+'\n})()',sandbox);
  let error;try {await fn(api);}catch(e){error=e;}
  return {error,sent,bytes,ports,closed,unmapped};
}
(async()=>{
  const ok=await run();assert.ifError(ok.error);assert.deepEqual(ok.sent,[...ok.bytes]);assert.deepEqual(ok.ports,[8084,9021]);assert.equal(ok.closed.length,2);assert.equal(ok.unmapped,1);
  const active=await run({managerRunning:true});assert.ifError(active.error);assert.equal(active.sent.length,0);assert.deepEqual(active.ports,[8084]);assert.equal(active.closed.length,1);assert.equal(active.unmapped,0);
  for(const options of [{loaderFails:true},{fetchFails:true},{badElf:true},{mmapFails:true},{timeoutFails:true},{writeFails:true}]) {
    const result=await run(options);assert(result.error);assert.equal(result.sent.length,0);assert.equal(result.closed.length,2);
    assert.equal(result.unmapped,options.writeFails?1:0);
  }
  console.log('Recovery checks passed: active manager skipped, existing loader required, short writes complete, bounded stalled writes and cleanup; no kernel access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
