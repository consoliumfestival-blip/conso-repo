const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('change hints share one subscription, debounce row events, refetch on reconnect/focus, and clean up', async () => {
  const cleanups = [];
  const channels = [];
  let removed = 0;
  let visibility;
  let appState;
  const supabase = {
    channel(topic) {
      const channel = { topic, on(type, filter, handler) { this.receive = handler; return this; },
        subscribe(handler) { this.status = handler; return this; } };
      channels.push(channel); return channel;
    },
    async removeChannel() { removed++; },
  };
  const context = { exports: {}, setTimeout, clearTimeout, Promise,
    document: { visibilityState: 'visible', addEventListener(type, fn) { visibility = fn; }, removeEventListener() {} },
    require(name) {
      if (name === 'react') return { useEffect: effect => cleanups.push(effect()), useRef: current => ({ current }) };
      if (name === 'react-native') return { Platform: { OS: 'web' }, AppState: { addEventListener(type, fn) { appState = fn; return { remove() {} }; } } };
      if (name === '../config/supabase') return { supabase };
      throw new Error(name);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/core/hooks/useCodeLetterUpdates.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  let first = 0, second = 0;
  context.exports.useCodeLetterUpdates('schedule:test', () => { first++; });
  context.exports.useCodeLetterUpdates('schedule:test', () => { second++; });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].topic, 'code-letters:schedule:test');
  channels[0].receive({ payload: { untrusted: true } });
  channels[0].receive({});
  await delay(200);
  assert.equal(first, 1); assert.equal(second, 1);
  channels[0].status('SUBSCRIBED');
  await delay(200);
  assert.equal(first, 2); assert.equal(second, 2);
  visibility();
  await delay(0);
  assert.equal(second, 3);
  assert.equal(appState, undefined, 'Web must not attach a second visibility listener via AppState');
  cleanups[0](); assert.equal(removed, 0);
  cleanups[1](); assert.equal(removed, 1);
});
