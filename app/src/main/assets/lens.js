(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let vault, opened = false, mode = 'unlock', gateEpoch = 0, idle;
  let entries = [];
  let camera = null, captureEpoch = 0, facing = 'environment', torch = false, seconds = 0, timer = null, photo = '';
  let incomingPair = null, writes = Promise.resolve(), lastCallState = 'idle';
  const message = text => { $('cameraStatus').textContent = text; };
  let allowIncoming=false,suspended=document.hidden;
  try{allowIncoming=localStorage.getItem('lens-listen')==='true'&&localStorage.getItem('lens-vault-v1')!==null;}catch(_){}
  const calls = () => window.LanuCalls;
  const storage = () => window.localStorage;
  function stopCamera() {
    captureEpoch++; clearTimeout(timer); timer = null; $('countdown').hidden = true;
    if (camera) camera.getTracks().forEach(t => t.stop());
    camera = null; $('preview').srcObject = null; torch = false;
    $('shutter').disabled = $('switchCamera').disabled = $('flashBtn').disabled = $('zoom').disabled = true;
    $('flashBtn').textContent = 'Flaş kapalı'; $('flashBtn').setAttribute('aria-pressed','false');
    $('cameraEmpty').hidden = false; $('startCamera').disabled = false;
  }
  async function startCamera() {
    stopCamera(); const token = captureEpoch;
    $('startCamera').disabled = true; message('Kamera açılıyor…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1440}},audio:false});
      if (token !== captureEpoch || opened || !$('gate').hidden || document.hidden) { stream.getTracks().forEach(t=>t.stop()); return; }
      if (!stream.getVideoTracks().length) { stream.getTracks().forEach(t=>t.stop()); throw Error('NoCamera'); }
      camera = stream; $('preview').srcObject = stream; await $('preview').play();
      if (camera !== stream) return;
      const track = stream.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {};
      $('flashBtn').disabled = !caps.torch; $('shutter').disabled = $('switchCamera').disabled = $('zoom').disabled = false;
      $('zoom').value = '1'; $('zoomValue').textContent = '1×'; $('preview').style.transform='';
      $('cameraEmpty').hidden = true; message('Hazır.');
      track.addEventListener('ended',()=>{if(camera===stream){stopCamera();message('Kamera kapandı. Yeniden açabilirsin.');}});
    } catch (e) {
      if(token!==captureEpoch)return;
      stopCamera(); message(e.name==='NotAllowedError' ? 'Kamera izni verilmedi. İzin verip yeniden deneyebilirsin.' : 'Kamera açılamadı. Başka uygulamada açıksa kapatıp yeniden dene.');
    }
  }
  function capture() {
    if (!camera || opened || ! $('gate').hidden) return;
    const video = $('preview'); if (!video.videoWidth) {message('Kamera henüz hazır değil.');return;}
    const canvas = document.createElement('canvas'), zoom = Number($('zoom').value);
    const width = video.videoWidth / zoom, height = video.videoHeight / zoom;
    const ratio = Math.min(1,1920/Math.max(width,height)); canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
    canvas.getContext('2d').drawImage(video,(video.videoWidth-width)/2,(video.videoHeight-height)/2,width,height,0,0,canvas.width,canvas.height);
    photo = canvas.toDataURL('image/jpeg',0.9); $('photoPreview').src = photo;
    const img = document.createElement('img'); img.src = photo; img.alt = ''; $('lastPhoto').replaceChildren(img); $('lastPhoto').disabled = false;
    $('photoView').hidden = false; $('photoStatus').textContent = 'Kaydetmek için aşağıdaki düğmeyi kullan.';
    message('Fotoğraf çekildi.');
  }
  function shutter() {
    if (!camera || timer) return;
    let remaining = seconds; const token = captureEpoch;
    const tick = () => {
      if(token!==captureEpoch)return;
      if(remaining<=0){timer=null;$('countdown').hidden=true;capture();return;}
      $('countdown').hidden=false;$('countdown').textContent=String(remaining--);timer=setTimeout(tick,1000);
    }; tick();
  }
  function gate(change = false) {
    stopCamera(); $('photoView').hidden = true; gateEpoch++;
    try {
      if(!window.crypto || !window.crypto.subtle) throw Error('CryptoUnavailable');
      if(!vault) vault=new LensVault(storage(),window.crypto);
      mode = change ? 'change' : vault.exists() ? 'unlock' : 'create';
      $('gateTitle').textContent=mode==='unlock'?'PIN':'PIN oluştur';
      $('confirmLabel').hidden=$('pinConfirm').hidden=mode==='unlock';
      $('pinConfirm').required=mode!=='unlock'; $('pinForm').reset();
      $('gateStatus').textContent=mode==='unlock'?'': '6–12 rakam seç. PIN unutulursa kayıtlar kurtarılamaz.';
      $('pinSubmit').disabled=false; $('gate').hidden=false; $('pin').focus();
    } catch (_) { message('Bu cihaz güvenli depolamayı açamıyor. Android System WebView güncellemesini kontrol et.'); }
  }
  function touch() { clearTimeout(idle); if(opened) idle=setTimeout(()=>{if(calls()&&calls().state()!=='idle')touch();else lock();},180000); }
  async function submitPin(event) {
    event.preventDefault(); if($('pinSubmit').disabled)return;
    const pin=$('pin').value, token=++gateEpoch;
    if(!/^\d{6,12}$/.test(pin)){ $('gateStatus').textContent='PIN 6–12 rakam olmalı.'; return; }
    if(mode!=='unlock' && pin!==$('pinConfirm').value){$('gateStatus').textContent='PIN değerleri aynı olmalı.';return;}
    $('pinSubmit').disabled=true;
    try {
      const until=Number(storage().getItem('lens-delay')||0);
      if(until>Date.now()) throw Error('Wait');
      await writes;
      if(token!==gateEpoch)return;
      const data=mode==='unlock'?await vault.unlock(pin):await vault.create(pin,()=>token===gateEpoch&&!document.hidden);
      if(token!==gateEpoch){vault.lock();return;}
      try{storage().removeItem('lens-failures');storage().removeItem('lens-delay');}catch(_){}
      allowIncoming=data.incomingEnabled!==false;try{storage().setItem('lens-listen',String(allowIncoming));}catch(_){allowIncoming=false;}$('incomingEnabled').checked=allowIncoming;
      opened=true;$('gate').hidden=true;$('cameraView').hidden=true;$('privateView').hidden=false;
      $('pinForm').reset();$('contactsEnabled').checked=!!data.contactsEnabled;renderContacts();touch();
      if(calls())calls().activate();
    }catch(e){
      if(token!==gateEpoch)return;
      if(mode==='unlock' && e.message!=='Wait') {
        try{const n=Number(storage().getItem('lens-failures')||0)+1;storage().setItem('lens-failures',String(n));if(n>=5){storage().setItem('lens-delay',String(Date.now()+60000));storage().setItem('lens-failures','0');}}catch(_){}
      }
      $('gateStatus').textContent=e.message==='Wait'?'Çok fazla deneme. Bir dakika sonra tekrar dene.':mode==='unlock'?'PIN doğrulanamadı veya kayıt okunamadı.':'PIN kaydedilemedi. Cihaz depolamasını kontrol et.';
    }finally{if(token===gateEpoch)$('pinSubmit').disabled=false;}
  }
  function dismissKeyboard() {
    if(document.activeElement && typeof document.activeElement.blur==='function')document.activeElement.blur();
    try{if(window.LanuAudio && typeof window.LanuAudio.hideKeyboard==='function')window.LanuAudio.hideKeyboard();}catch(_){}
  }
  function lock(listen = true) {
    dismissKeyboard();gateEpoch++;opened=false;clearTimeout(idle);incomingPair=null;
    if(calls())calls().deactivate(listen&&allowIncoming&&!suspended); if(vault)vault.lock();
    $('privateView').hidden=$('gate').hidden=true;$('cameraView').hidden=false;
    $('pinForm').reset();$('contactList').replaceChildren();$('contactName').value=$('partner').value=$('pairCode').value='';
    $('pairRequest').hidden=true;$('pairStatus').textContent='';$('myid').textContent='······';
    stopCamera();window.scrollTo(0,0);message('Fotoğraf çekmek için kamerayı aç.');
  }
  function persist(update) {
    const scheduledEpoch=gateEpoch;
    const operation=async()=>{
      if(!opened||!vault||!vault.data||scheduledEpoch!==gateEpoch)return false;
      const token=gateEpoch,candidate=JSON.parse(JSON.stringify(vault.data));update(candidate);
      try{await vault.write(candidate);if(opened&&token===gateEpoch){vault.data=candidate;renderContacts();}return true;}
      catch(_){if(opened)$('pairStatus').textContent='Değişiklik kaydedilemedi. Depolamayı kontrol et.';return false;}
    };
    writes=writes.then(operation,operation);return writes;
  }
  function renderContacts() {
    $('contactList').replaceChildren(); if(!opened||!vault.data)return;
    $('contactsEnabled').checked=!!vault.data.contactsEnabled; if(!vault.data.contactsEnabled)return;
    for(const contact of vault.data.contacts){
      if(!/^[1-9]\d{5}$/.test(contact.code))continue;
      const row=document.createElement('div');row.className='contact';
      const name=document.createElement('span');name.textContent=contact.name||contact.code;
      const dial=document.createElement('button');dial.textContent='Ara';dial.addEventListener('click',()=>calls().dial(contact.code));
      const remove=document.createElement('button');remove.className='secondary';remove.textContent='Sil';remove.addEventListener('click',()=>persist(data=>{data.contacts=data.contacts.filter(c=>c.code!==contact.code);}));
      row.append(name,dial,remove);$('contactList').append(row);
    }
  }
  async function paired(code) {
    if(!opened||!vault.data.contactsEnabled)return;
    const name=$('contactName').value.trim().slice(0,40)||code;
    await persist(data=>{const found=data.contacts.find(c=>c.code===code);if(found)found.name=name;else if(data.contacts.length<200)data.contacts.push({code,name});});
  }
  window.LanuLens={isOpen:()=>opened,canReceive:()=>allowIncoming&&!suspended,lock,stopCamera,
    callState(state){if(state!=='idle')stopCamera();if(opened&&state==='ringing'&&lastCallState!=='ringing')$('answerBtn').scrollIntoView({block:'center',behavior:'smooth'});lastCallState=state;touch();},
    pairStatus(text){if(opened)$('pairStatus').textContent=text;},
    paired,
    pairRequest(code,respond){
      if(!opened||incomingPair){respond(false);return;}
      incomingPair={code,respond};$('pairFrom').textContent=code+' kodundan eşleştirme isteği.';
      $('saveIncoming').checked=!!vault.data.contactsEnabled;$('saveIncoming').disabled=!vault.data.contactsEnabled;$('pairRequest').hidden=false;
    },
    clearPair(){incomingPair=null;$('pairRequest').hidden=true;}
  };
  window.lanuPhotoSaved=ok=>{$('savePhoto').disabled=false;$('photoStatus').textContent=ok?'Fotoğraf kaydedildi.':'Fotoğraf kaydedilmedi.';};
  window.lanuForeground=()=>{suspended=false;};
  window.lanuBackground=()=>{entries.forEach(entry=>entry.cancel());suspended=true;lock(false);};
  window.lanuBack=()=>{if(opened||!$('gate').hidden){lock();return true;}if(!$('photoView').hidden){$('photoView').hidden=true;return true;}return false;};
  entries = Array.from(document.querySelectorAll('[data-lens-entry]')).map(element => LensEntry.attach(element, () => gate(), {
    enabled: () => !$('cameraView').hidden && $('gate').hidden && $('photoView').hidden && !document.hidden
  }));
  $('startCamera').addEventListener('click',startCamera);$('shutter').addEventListener('click',shutter);
  $('switchCamera').addEventListener('click',()=>{facing=facing==='environment'?'user':'environment';startCamera();});
  $('gridBtn').addEventListener('click',()=>{$('cameraGrid').hidden=!$('cameraGrid').hidden;$('gridBtn').setAttribute('aria-pressed',String(!$('cameraGrid').hidden));});
  $('timerBtn').addEventListener('click',()=>{seconds=seconds===0?3:seconds===3?10:0;$('timerBtn').textContent=seconds?seconds+' sn':'Süre kapalı';});
  $('zoom').addEventListener('input',()=>{$('zoomValue').textContent=Number($('zoom').value).toFixed(1)+'×';$('preview').style.transform='scale('+$('zoom').value+')';});
  $('flashBtn').addEventListener('click',async()=>{if(!camera)return;try{await camera.getVideoTracks()[0].applyConstraints({advanced:[{torch:!torch}]});torch=!torch;$('flashBtn').textContent=torch?'Flaş açık':'Flaş kapalı';$('flashBtn').setAttribute('aria-pressed',String(torch));}catch(_){message('Bu kamera flaşı desteklemiyor.');}});
  $('lastPhoto').addEventListener('click',()=>{$('photoView').hidden=false;});$('closePhoto').addEventListener('click',()=>{$('photoView').hidden=true;});
  $('savePhoto').addEventListener('click',()=>{
    if(!photo)return;
    if(window.LanuAudio&&typeof window.LanuAudio.savePhoto==='function'){$('savePhoto').disabled=true;window.LanuAudio.savePhoto(photo);}
    else{const link=document.createElement('a');link.href=photo;link.download='Lanu-Lens-'+Date.now()+'.jpg';link.click();$('photoStatus').textContent='Fotoğraf indirme isteği gönderildi.';}
  });
  $('pinForm').addEventListener('submit',submitPin);$('cancelGate').addEventListener('click',()=>{dismissKeyboard();gateEpoch++;$('gate').hidden=true;$('pinForm').reset();if(!opened&&vault)vault.lock();});
  $('lockBtn').addEventListener('click',()=>lock());$('changePin').addEventListener('click',()=>gate(true));
  $('contactsEnabled').addEventListener('change',async()=>{const desired=$('contactsEnabled').checked;const ok=await persist(data=>{data.contactsEnabled=desired;});if(!ok)$('contactsEnabled').checked=!desired;});
  $('incomingEnabled').addEventListener('change',async()=>{const desired=$('incomingEnabled').checked;const ok=await persist(data=>{data.incomingEnabled=desired;});if(ok&&opened){allowIncoming=desired;try{storage().setItem('lens-listen',String(desired));}catch(_){}}else $('incomingEnabled').checked=!desired;});
  $('pairBtn').addEventListener('click',()=>{if(opened)calls().pair($('pairCode').value.trim());});
  $('pairAccept').addEventListener('click',()=>{if(!incomingPair)return;const req=incomingPair;incomingPair=null;$('pairRequest').hidden=true;req.respond(true);if($('saveIncoming').checked)paired(req.code);});
  $('pairReject').addEventListener('click',()=>{if(incomingPair)incomingPair.respond(false);incomingPair=null;$('pairRequest').hidden=true;});
  document.addEventListener('pointerdown',touch);document.addEventListener('keydown',touch);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){window.lanuBackground();}else window.lanuForeground();});
})();
