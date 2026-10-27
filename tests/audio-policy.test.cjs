const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policy=require('../app/src/main/assets/audio-policy.js');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');

test('audio profile module is available in both native WebView and test runner',()=>{
  const script=fs.readFileSync('app/src/main/assets/audio-policy.js','utf8');
  const browser={window:{}};
  vm.runInNewContext(script,browser);
  assert.equal(typeof browser.window.LanuAudioPolicy.live,'function');
  assert.match(html,/<script defer src="audio-policy\.js"><\/script><script defer src="app\.js"><\/script>/);
});
test('balanced has no unintended aggressive AGC and current HTML agrees',()=>{
  assert.deepEqual(policy.presets.balanced,{ns:true,ec:true,agc:false});
  assert.equal(policy.matched({ns:true,ec:true,agc:false}),'balanced');
  assert.equal(policy.matched({ns:true,ec:true,agc:true}),'noisy');
  assert.equal(policy.matched({ns:false,ec:true,agc:false}),'natural');
  assert.equal(policy.matched({ns:false,ec:false,agc:false}),'custom');
  assert.match(html,/<input type="checkbox" id="agc">/);
});
test('unsupported legacy Android WebView never invents applied noise reduction',()=>{
  const bad={getSupportedConstraints(){throw Error('LegacyWebView');}};
  assert.deepEqual(policy.capabilities(bad),{});
  assert.equal(policy.request({},policy.presets.noisy),true);
  assert.deepEqual(policy.live({},policy.presets.noisy),{});
  assert.match(policy.status({}, {},policy.presets.noisy),/Gürültü: desteklenmiyor/);
});
test('individual supported filters are mapped exactly without unknown browser keys',()=>{
  const cap={noiseSuppression:true,echoCancellation:false,autoGainControl:true,unknown:true};
  const prefs={ns:true,ec:true,agc:false};
  assert.deepEqual(policy.request(cap,prefs),{noiseSuppression:true,autoGainControl:false});
  assert.deepEqual(policy.live(cap,prefs),{noiseSuppression:true,autoGainControl:false});
});
test('actual Android DSP status is reported, not assumed from the requested checkbox',()=>{
  const cap={noiseSuppression:true,echoCancellation:true,autoGainControl:true};
  const prefs={ns:true,ec:true,agc:false};
  const status=policy.status(cap,{noiseSuppression:false,echoCancellation:true},prefs);
  assert.match(status,/Gürültü: istenen ayar uygulanmadı/);
  assert.match(status,/Yankı: açık/);
  assert.match(status,/Denge: cihaz doğrulamıyor/);
  assert.doesNotMatch(status,/yapay zeka|AI/);
});
