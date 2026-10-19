const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {attach}=require('../app/src/main/assets/entry.js');
function harness(){
 let now=0,next=0,opened=0,enabled=true;const timers=new Map(),handlers=new Map();
 const element={addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);}};
 const clock={setTimeout(fn,delay){const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
 const entry=attach(element,()=>opened++,{clock,enabled:()=>enabled});
 function emit(type,props={}){const event={cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...props};for(const fn of handlers.get(type)||[])fn(event);return event;}
 function tick(ms){const limit=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=limit).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();}now=limit;}
 const finger=(x=20,y=20,id=1)=>({identifier:id,clientX:x,clientY:y});
 const down=()=>emit('touchstart',{touches:[finger()]});
 return {emit,tick,entry,finger,down,opened:()=>opened,disable:()=>{enabled=false;}};
}
test('both visible lens emblems register the private entry gesture',()=>{
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 assert.match(html,/<button[^>]*id="lensLogo"[^>]*data-lens-entry/);
 assert.match(html,/<button[^>]*id="lensEmblem"[^>]*data-lens-entry/);
 assert.match(html,/src="entry.js"/);
});
test('a continuous touch opens once at three seconds',()=>{const h=harness();assert.equal(h.down().defaultPrevented,true);h.tick(2999);assert.equal(h.opened(),0);h.tick(1);assert.equal(h.opened(),1);h.tick(5000);assert.equal(h.opened(),1);});
test('WebView compatibility pointer cancellation cannot cancel an active touch hold',()=>{const h=harness();h.down();h.tick(600);h.emit('pointercancel',{pointerType:'touch'});h.emit('pointerleave',{pointerType:'touch'});assert.equal(h.emit('contextmenu').defaultPrevented,true);h.tick(2400);assert.equal(h.opened(),1);});
test('short touches and real touch cancellation never open the gate later',()=>{for(const event of ['touchend','touchcancel']){const h=harness();h.down();h.tick(400);h.emit(event);h.tick(4000);assert.equal(h.opened(),0);}});
test('small finger drift is allowed while a deliberate swipe cancels',()=>{for(const drift of [8,30]){const h=harness();h.down();h.emit('touchmove',{touches:[h.finger(20+drift,20)]});h.tick(3100);assert.equal(h.opened(),drift===8?1:0);}});
test('multiple fingers cancel and cannot create a delayed entry',()=>{const h=harness();h.down();h.emit('touchstart',{touches:[h.finger(),h.finger(30,30,2)]});h.tick(4000);assert.equal(h.opened(),0);});
test('mouse release or leaving the emblem cancels its hold',()=>{for(const event of ['pointerup','pointerleave','pointercancel']){const h=harness();h.emit('pointerdown',{pointerType:'mouse',button:0,clientX:20,clientY:20,pointerId:1});h.tick(500);h.emit(event);h.tick(4000);assert.equal(h.opened(),0);}});
test('keyboard repeat does not reset the hold deadline',()=>{const h=harness();h.emit('keydown',{key:'Enter',repeat:false});h.tick(1000);h.emit('keydown',{key:'Enter',repeat:true});h.tick(2000);assert.equal(h.opened(),1);});
test('blur, background cancellation and destruction prevent delayed entry',()=>{for(const end of ['cancel','destroy']){const h=harness();h.down();h.tick(100);if(end==='blur')h.emit('blur');else h.entry[end]();h.tick(4000);assert.equal(h.opened(),0);}});
test('an obscured or disabled camera surface cannot open a gate',()=>{const h=harness();h.down();h.tick(2000);h.disable();h.tick(2000);assert.equal(h.opened(),0);h.down();h.tick(4000);assert.equal(h.opened(),0);});

test('keyboard focus changes do not cancel an uninterrupted touch hold',()=>{const h=harness();h.down();h.tick(400);h.emit('blur');h.tick(2600);assert.equal(h.opened(),1);});
test('losing keyboard focus cancels a keyboard hold',()=>{const h=harness();h.emit('keydown',{key:'Enter'});h.tick(400);h.emit('blur');h.tick(4000);assert.equal(h.opened(),0);});
