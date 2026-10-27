(function(root){
  'use strict';
  // Browser and Node share one pure microphone policy: no device data, logs or permissions.
  const keys=Object.freeze({ns:'noiseSuppression',ec:'echoCancellation',agc:'autoGainControl'});
  const presets=Object.freeze({
    balanced:Object.freeze({ns:true,ec:true,agc:false}),
    noisy:Object.freeze({ns:true,ec:true,agc:true}),
    natural:Object.freeze({ns:false,ec:true,agc:false})
  });
  function capabilities(devices){
    try {
      const result=devices && typeof devices.getSupportedConstraints==='function'
        ? devices.getSupportedConstraints() : null;
      return result && typeof result==='object' ? result : {};
    } catch(_) { return {}; }
  }
  function request(supported,choices){
    const audio={};
    for(const [id,key] of Object.entries(keys)){
      if(supported && supported[key]===true && choices && typeof choices[id]==='boolean'){
        audio[key]=choices[id];
      }
    }
    return Object.keys(audio).length>0?audio:true;
  }
  function live(supported,choices){
    const requested=request(supported,choices);
    // MediaStreamTrack.applyConstraints requires a dictionary, not boolean true.
    return requested===true?{}:requested;
  }
  function matched(choices){
    for(const [id,profile] of Object.entries(presets)){
      if(Object.keys(keys).every(k=>choices[k]===profile[k]))return id;
    }
    return 'custom';
  }
  function status(supported,settings,choices){
    const labels={ns:'Gürültü',ec:'Yankı',agc:'Denge'};
    return Object.entries(keys).map(([id,key])=>{
      if(!supported || supported[key]!==true)return labels[id]+': desteklenmiyor';
      const actual=settings && settings[key];
      if(typeof actual!=='boolean')return labels[id]+': cihaz doğrulamıyor';
      if(actual!==(choices&&choices[id]))return labels[id]+': istenen ayar uygulanmadı';
      return labels[id]+': '+(actual?'açık':'kapalı');
    }).join(' · ');
  }
  const policy=Object.freeze({presets,capabilities,request,live,matched,status});
  if(typeof module!=='undefined'&&module.exports)module.exports=policy;
  else root.LanuAudioPolicy=policy;
})(typeof window!=='undefined'?window:globalThis);
