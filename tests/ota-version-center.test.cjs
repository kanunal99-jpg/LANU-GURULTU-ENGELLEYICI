const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const js=fs.readFileSync('app/src/main/assets/lens.js','utf8');
const native=fs.readFileSync('app/src/main/java/com/lanu/sesli/LanuUpdater.java','utf8');
const bridge=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
const css=fs.readFileSync('app/src/main/assets/style.css','utf8');

function updaterView(unlocked=true) {
  const nodes=new Map();
  const $=name=>{
    if(!nodes.has(name))nodes.set(name,{textContent:'',hidden:true,disabled:false,value:0});
    return nodes.get(name);
  };
  const start=js.indexOf('  window.lanuUpdateEvent = event => {');
  const end=js.indexOf('  const storage = () =>',start);
  assert.ok(start>=0 && end>start,'Updater event handler is required');
  const window={};
  vm.runInNewContext(js.slice(start,end),{window,opened:unlocked,$,Number,String,Math});
  return {event:window.lanuUpdateEvent,$};
}
test('update version center remains inside PIN-protected panel with no GitHub navigation',()=>{
  const from=html.indexOf('id="updatesPane"'),to=html.indexOf('id="diagnosticsPane"');
  const pane=html.slice(from,to);
  assert.ok(from>html.indexOf('id="privateView"'));
  for(const id of ['installedVersion','availableVersion','updateProgress','cancelUpdate','checkUpdates','installUpdate'])
    assert.ok(pane.includes('id="'+id+'"'),id);
  assert.doesNotMatch(pane,/id="updateReleases"|https?:\/\/github\.com/);
  assert.doesNotMatch(js,/updateReleases|LanuUpdate\.releases\(/);
  assert.doesNotMatch(bridge,/@JavascriptInterface public void releases\(/);
  assert.doesNotMatch(native,/void releasePage\(/);
});
test('native statuses display current version and stronger newer release code accurately',()=>{
  const h=updaterView();
  h.event({state:'available',version:'2.0.10',versionCode:204,configured:true,
    availableVersion:'2.0.11',availableVersionCode:210,message:'Yeni sürüm'});
  assert.equal(h.$('installedVersion').textContent,'2.0.10 (kod 204)');
  assert.equal(h.$('availableVersion').textContent,'2.0.11 (kod 210)');
  assert.equal(h.$('downloadUpdate').hidden,false);
  assert.equal(h.$('installUpdate').hidden,true);
  h.event({state:'current',version:'2.0.11',versionCode:210,configured:true,message:'Güncel'});
  assert.equal(h.$('availableVersion').textContent,'Güncel');
  assert.equal(h.$('downloadUpdate').hidden,true);
  assert.equal(h.$('updateFileSize').hidden,true);
});
test('unconfigured signatures never report a new version as installable',()=>{
  const h=updaterView();
  h.event({state:'not_configured',version:'2.0.10',versionCode:204,configured:false,
    message:'Kalıcı üretim imzası gerekli'});
  assert.equal(h.$('availableVersion').textContent,'Yayın bekleniyor');
  assert.equal(h.$('downloadUpdate').hidden,true);
  assert.equal(h.$('installUpdate').hidden,true);
});
test('APK size is shown only for a valid available release and not in the public PIN-locked view',()=>{
  const h=updaterView();
  h.event({state:'available',version:'2.0.10',versionCode:214,availableVersion:'2.0.11',availableVersionCode:220,availableSizeBytes:12*1048576});
  assert.equal(h.$('updateFileSize').hidden,false);
  assert.equal(h.$('updateFileSize').textContent,'Güncelleme APK boyutu: 12.0 MB');
  h.event({state:'available',availableVersion:'2.0.11',availableSizeBytes:NaN});
  assert.equal(h.$('updateFileSize').hidden,true);
  h.event({state:'current'});
  assert.equal(h.$('updateFileSize').textContent,'');
  const locked=updaterView(false);
  locked.event({state:'available',availableVersion:'2.0.11',availableSizeBytes:12*1048576});
  assert.equal(locked.$('updateFileSize').hidden,true);
});
test('progress and cancellation are visible only during active download',()=>{
  const h=updaterView();
  h.event({state:'downloading',progressPercent:53,version:'2.0.10'});
  assert.equal(h.$('updateProgressBox').hidden,false);
  assert.equal(h.$('updateProgress').value,53);
  assert.equal(h.$('cancelUpdate').disabled,false);
  h.event({state:'cancelling',progressPercent:53,version:'2.0.10'});
  assert.equal(h.$('cancelUpdate').disabled,true);
  assert.match(h.$('updateProgressLabel').textContent,/durduruluyor/);
  h.event({state:'cancelled',version:'2.0.10'});
  assert.equal(h.$('updateProgressBox').hidden,true);
});
test('invalid or oversized percentage is clamped, no accidental code injection into UI',()=>{
  const h=updaterView();
  h.event({state:'downloading',progressPercent:900,version:'2.0.10'});
  assert.equal(h.$('updateProgress').value,100);
  h.event({state:'downloading',progressPercent:-100,version:'2.0.10'});
  assert.equal(h.$('updateProgress').value,0);
  h.event({state:'available',availableVersion:'<svg onload=alert(1)>',version:'2.0.10'});
  assert.equal(h.$('availableVersion').textContent,'Yeni sürüm yok');
});
test('when PIN is locked update events do not write sensitive UI fields',()=>{
  const h=updaterView(false);
  h.event({state:'available',version:'2.0.10',availableVersion:'2.0.11'});
  assert.equal(h.$('availableVersion').textContent,'');
});
test('cancel bridge requires private unlock, stops network, and cleans partial APK',()=>{
  assert.match(bridge,/@JavascriptInterface public void cancelDownload\(\) \{ main\.post\(\(\) -> \{ if \(canShowUpdater\(\)\) updater\.cancelDownload\(\); \}\); \}/);
  assert.match(js,/if\(opened&&window\.LanuUpdate\)window\.LanuUpdate\.cancelDownload\(\)/);
  assert.match(native,/void cancelDownload\(\) \{/);
  assert.match(native,/cancelRequested = true/);
  assert.match(native,/current\.disconnect\(\)/);
  assert.match(native,/if\(cancelRequested\)throw new java\.io\.InterruptedIOException/);
  assert.match(native,/tmp\.delete\(\)/);
  assert.match(native,/emit\(canceled\?"cancelled":"error"/);
  assert.match(native,/validatePackage\(tmp,next\.code,next\.version\)/);
  assert.match(native,/matchesDigest\(file,candidate\.size,candidate\.sha\)/);
  assert.match(native,/installedSignerMatchesPinnedCert\(\)/);
});
test('private update cards are responsive and progress control is accessible',()=>{
  assert.match(html,/<progress id="updateProgress" max="100" value="0"><\/progress>/);
  assert.match(html,/label for="updateProgress"/);
  assert.match(css,/\.version-comparison/);
  assert.match(html,/id="updateFileSize"/);
  assert.match(native,/j\.put\("availableSizeBytes",latest\.size\)/);
  assert.match(css,/#updateProgressBox/);
});