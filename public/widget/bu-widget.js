(function () {
  if (window.__BU_WIDGET_LOADED) return;
  window.__BU_WIDGET_LOADED = true;

  function currentScript() {
    return document.currentScript || document.querySelector('script[src*="bu-widget.js"]');
  }

  var script = currentScript();
  if (!script) return;

  var publicKey = script.getAttribute('data-public-key') || '';
  var eventId =
    script.getAttribute('data-event-id') || script.getAttribute('data-event-slug') || '';
  var ticketType = script.getAttribute('data-ticket-type') || '';
  var label = script.getAttribute('data-button-text') || 'Pay with ɃU';
  var origin = script.src.replace(/\/widget\/bu-widget\.js.*$/, '');

  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText =
    'background:#C41E3A;color:#fff;border:0;border-radius:12px;padding:12px 18px;font:600 14px/1 system-ui;cursor:pointer';

  var overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483646;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML =
    '<div style="position:relative;width:min(430px,100%);height:min(760px,92vh);background:#111;border-radius:16px;overflow:hidden">' +
    '<button type="button" data-bu-close style="position:absolute;right:8px;top:8px;z-index:2;background:#000;color:#fff;border:0;border-radius:999px;width:32px;height:32px">×</button>' +
    '<iframe title="BU tickets" style="width:100%;height:100%;border:0" allow="payment *"></iframe></div>';

  button.addEventListener('click', function () {
    if (!publicKey || !eventId) {
      window.alert('ɃU widget needs data-public-key and data-event-id');
      return;
    }
    var frame = overlay.querySelector('iframe');
    var url =
      origin +
      '/g/' +
      encodeURIComponent(eventId) +
      '?pk=' +
      encodeURIComponent(publicKey);
    if (ticketType) url += '&type=' + encodeURIComponent(ticketType);
    if (frame) frame.src = url;
    overlay.style.display = 'flex';
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || (e.target && e.target.getAttribute && e.target.getAttribute('data-bu-close') !== null)) {
      overlay.style.display = 'none';
    }
  });

  script.parentNode.insertBefore(button, script);
  document.body.appendChild(overlay);
})();
