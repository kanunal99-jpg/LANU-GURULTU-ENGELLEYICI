'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process');
test('draft release readback accepts 4 real byte matches, rejects corruption and unsafe metadata',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-draft-release-'));
  try{
    const dist=path.join(tmp,'dist'),remote=path.join(tmp,'remote');
    const out=path.join(tmp,'out'),bin=path.join(tmp,'bin');
    for(const dir of [dist,remote,out,bin])fs.mkdirSync(dir);
    const names=['Lanu-Lens-2.0.10.apk','SHA256SUMS.txt','APK-BILGILERI.txt','APK-IMZA-DURUMU.txt'];
    const apk=Buffer.alloc(2048,0xab),sha=crypto.createHash('sha256').update(apk).digest('hex');
    const bodies=[apk,Buffer.from(sha+'  '+names[0]+'\n'),
      Buffer.from('package=com.lanu.sesli\n'),Buffer.from('SIGNING_MODE=DEBUG\n')];
    const assets=names.map((name,i)=>({id:101+i,name,size:bodies[i].length}));
    for(let i=0;i<names.length;i++){
      fs.writeFileSync(path.join(dist,names[i]),bodies[i]);
      fs.writeFileSync(path.join(remote,String(101+i)),bodies[i]);
    }
    const releasePath=path.join(tmp,'release.json');
    const release={draft:true,id:42,assets};
    const save=()=>fs.writeFileSync(releasePath,JSON.stringify(release));
    save();
    fs.writeFileSync(path.join(bin,'gh'),
      '#!/usr/bin/env bash\nset -euo pipefail\n' +
      '[[ "$1" == "api" && "$2" == "-H" && "$3" == "Accept: application/octet-stream" ]] || exit 8\n' +
      'last="${@: -1}"\nid="${last##*/}"\ncat "$MOCK_REMOTE/$id"\n',
      {mode:0o755});
    const run=()=>cp.spawnSync('bash',['scripts/verify-draft-release-assets.sh',
      releasePath,dist,out,'kanunal99-jpg/LANU-GURULTU-ENGELLEYICI'],{
      cwd:process.cwd(),env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_REMOTE:remote},encoding:'utf8'});
    let result=run();
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    assert.match(result.stdout,/Four authenticated draft release assets/);
    fs.writeFileSync(path.join(remote,'101'),Buffer.alloc(2048,0x00));
    result=run();
    assert.notEqual(result.status,0,'Altered APK from remote must not pass');
    fs.writeFileSync(path.join(remote,'101'),apk);
    release.assets=assets.slice(0,3);save();
    result=run();assert.notEqual(result.status,0,'Missing asset ID must fail');
    release.assets=assets;release.draft=false;save();
    result=run();assert.notEqual(result.status,0,'A published release must not count as draft');
    release.draft=true;release.assets=[...assets,{...assets[0],id:199}];save();
    result=run();assert.notEqual(result.status,0,'Ambiguous asset IDs must fail');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
