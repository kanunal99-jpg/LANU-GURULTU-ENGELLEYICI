(function (root) {
  'use strict';
  // Touch owns its timer. WebView compatibility pointercancel must not cancel
  // an otherwise uninterrupted touch hold (for example image long-press).
  function attach(element, open, options = {}) {
    const clock = options.clock || root;
    const enabled = options.enabled || (() => true);
    let press = null, timer = null;
    const listeners = [];
    function cancel(source) {
      if (source && press && source !== press.source) return;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null; press = null;
    }
    function begin(source, x, y, id) {
      cancel(); if (!enabled()) return;
      press = {source, x, y, id};
      timer = clock.setTimeout(() => {
        const current = press; timer = null; press = null;
        if (current && enabled()) open();
      }, 3000);
    }
    function move(source, x, y) {
      if (press && press.source === source && Math.hypot(x - press.x, y - press.y) > 18) cancel();
    }
    function on(type, fn, config) { element.addEventListener(type, fn, config); listeners.push([type,fn,config]); }
    const prevent = event => { if (event.cancelable !== false) event.preventDefault(); };
    on('touchstart', event => {
      prevent(event);
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0]; begin('touch',touch.clientX,touch.clientY,touch.identifier);
    }, {passive:false});
    on('touchmove', event => {
      if (!press || press.source !== 'touch') return;
      prevent(event);
      if (event.touches.length !== 1 || event.touches[0].identifier !== press.id) { cancel(); return; }
      move('touch',event.touches[0].clientX,event.touches[0].clientY);
    }, {passive:false});
    on('touchend', event => { prevent(event); cancel('touch'); }, {passive:false});
    on('touchcancel', () => cancel('touch'));
    on('pointerdown', event => {
      if (event.pointerType === 'touch') return;
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      prevent(event); begin('pointer',event.clientX,event.clientY,event.pointerId);
    });
    on('pointermove', event => { if (press && press.id === event.pointerId) move('pointer',event.clientX,event.clientY); });
    ['pointerup','pointercancel','pointerleave'].forEach(type => on(type,() => cancel('pointer')));
    ['contextmenu','dragstart'].forEach(type => on(type,prevent));
    on('keydown', event => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { prevent(event); begin('keyboard',0,0); }
    });
    on('keyup', event => { if (event.key === ' ' || event.key === 'Enter') cancel('keyboard'); });
    on('blur', () => { if (press && press.source !== 'touch') cancel(); });
    return {cancel:() => cancel(), destroy() { cancel(); for (const [type,fn,config] of listeners) element.removeEventListener(type,fn,config); }};
  }
  root.LensEntry = {attach};
  if (typeof module !== 'undefined') module.exports = {attach};
})(typeof window !== 'undefined' ? window : globalThis);
