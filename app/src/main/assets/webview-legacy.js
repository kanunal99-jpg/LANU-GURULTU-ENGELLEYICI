(function () {
  'use strict';
  // Android 10 devices with an unupdated Chrome 74 WebView do not implement
  // Element.replaceChildren. The PIN vault and private DOM must not crash
  // because a convenience DOM method is unavailable.
  if (typeof Element === 'undefined' || typeof Element.prototype.replaceChildren === 'function') return;
  Element.prototype.replaceChildren = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < arguments.length; i++) {
      var child = arguments[i];
      this.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  };
})();
