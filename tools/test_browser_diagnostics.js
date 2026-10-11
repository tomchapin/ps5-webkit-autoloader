// Verify that diagnostics report links/errors and remain bounded on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const requests = [];
let interval;
let observer;
const output = {};
const sandbox = {
  document: {
    title: 'Test host', getElementById: () => output,
    addEventListener: (event, fn) => { listeners[event] = fn; }
  },
  location: { href: 'https://manuals.playstation.net/document/en/ps5/index.html' },
  navigator: { userAgent: 'PlayStation 5/9.00' },
  addEventListener: (event, fn) => { listeners[event] = fn; },
  setInterval: fn => { interval = fn; },
  MutationObserver: function (fn) { observer = fn; this.observe = () => {}; },
  XMLHttpRequest: function () {
    requests.push(this);
    this.open = (method, path, async) => { Object.assign(this, { method, path, async }); };
    this.setRequestHeader = () => {};
    this.send = body => { this.events = JSON.parse(body); };
  }
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync('frontend/autoloader/diagnostics.js', 'utf8'), sandbox);
assert.equal(requests[0].path, '/__host_diagnostics');
assert.equal(requests[0].method, 'POST');
assert.equal(requests[0].events[0].event, 'page');
function complete(status = 204) {
  const request = requests.at(-1);
  request.status = status;
  request.onloadend();
}
complete();
const link = { nodeType: 1, tagName: 'A', textContent: 'Payloads', href: 'http://127.0.0.1:8080/' };
listeners.click({ target: { nodeType: 1, tagName: 'SPAN', parentNode: link } });
assert.equal(requests.at(-1).events[0].detail, 'Payloads -> http://127.0.0.1:8080/');
complete();
listeners.error({ message: 'broken', filename: 'page.js', lineno: 2, colno: 3 });
assert.equal(requests.at(-1).events[0].detail, 'broken at page.js:2:3');
complete();
for (let i = 0; i < 250; i++) {
  observer([{ target: output, addedNodes: [{ nodeType: 1, parentNode: output, textContent: 'line' + i }] }]);
}
interval();
assert.equal(requests.at(-1).events.length, 20);
assert.equal(requests.at(-1).events[0].detail, 'line50');
complete(404);
interval(); complete(404);
interval(); complete(404);
const count = requests.length;
interval();
assert.equal(requests.length, count);
console.log('Browser diagnostics: page, nested link, errors, bounded batches and failure cutoff passed.');
