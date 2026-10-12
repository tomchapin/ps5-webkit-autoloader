// Included only in the PC host pages. Keep telemetry bounded and best effort.
(function () {
  'use strict';
  var queue = [];
  var busy = false;
  var stopped = false;
  var failures = 0;
  function record(event, detail) {
    if (stopped) return;
    if (queue.length >= 200) queue.shift();
    queue.push({ event: event, detail: String(detail).slice(0, 2000) });
  }
  function flush() {
    if (busy || stopped || !queue.length) return;
    try {
      busy = true;
      var request = new XMLHttpRequest();
      request.open('POST', '/__host_diagnostics', true);
      request.timeout = 3000;
      request.setRequestHeader('Content-Type', 'application/json');
      request.onloadend = function () {
        busy = false;
        if (request.status !== 204 && ++failures >= 3) stopped = true;
      };
      request.send(JSON.stringify(queue.splice(0, 20)));
    } catch (error) {
      busy = false;
      stopped = true;
    }
  }
  window.addEventListener('error', function (event) {
    record('error', event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno);
    flush();
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    record('unhandledrejection', reason && reason.stack || reason);
    flush();
  });
  document.addEventListener('click', function (event) {
    var link = event.target;
    while (link && link.nodeType === 1 && link.tagName !== 'A') link = link.parentNode;
    if (link && link.tagName === 'A') {
      record('link', (link.textContent || '') + ' -> ' + link.href);
      flush();
    }
  }, true);
  var output = document.getElementById('console');
  if (output && typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (records) {
      var changed = [];
      records.forEach(function (mutation) {
        function remember(node) {
          if (node.nodeType !== 1) node = node.parentNode;
          while (node && node.parentNode !== output) node = node.parentNode;
          if (node && changed.indexOf(node) < 0) changed.push(node);
        }
        if (mutation.target === output) {
          for (var i = 0; i < mutation.addedNodes.length; i++) remember(mutation.addedNodes[i]);
        } else remember(mutation.target);
      });
      changed.forEach(function (node) { record('console', node.textContent || ''); });
    });
    observer.observe(output, { childList: true, subtree: true, characterData: true });
  }
  record('page', location.href + ' | ' + document.title + ' | ' + navigator.userAgent);
  if (typeof setInterval !== 'undefined') setInterval(flush, 1500);
  flush();
}());
