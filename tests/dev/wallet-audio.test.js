const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../js/components/wallet-panel.js"), "utf8");

function walletAudio() {
  let now = 0;
  let reduced = false;
  let random = 0;
  let drops = 0;
  let fetchResponse = {
    ok: true,
    json: async () => ({
      status: "earned",
      action: "achievement",
      amount: 15000,
      balance: 15000,
    }),
  };
  const fetched = [];
  const played = [];
  const preloaded = [];
  const control = { addEventListener() {} };
  const portal = { dataset: {}, querySelector: () => control };
  const audioManager = {
    enabled: true,
    preload: (name, src) => preloaded.push({ name, src }),
    play: (name) => played.push(name),
  };
  const context = vm.createContext({
    audioManager,
    appState: { getUserId: () => "player" },
    EventBus: { instance: { addEventListener() {} } },
    AbortController,
    console,
    fetch: async (url, options) => {
      fetched.push({ url, options });
      return fetchResponse;
    },
    performance: { now: () => now },
    Math: Object.assign(Object.create(Math), { random: () => random }),
    localStorage: { getItem: () => null },
    window: { matchMedia: () => ({ matches: reduced }), addEventListener() {} },
    document: {
      querySelector: () => portal,
      body: { append() {} },
      addEventListener() {},
      querySelectorAll: () => [
        {
          classList: {
            remove() {},
            add: () => {
              drops++;
            },
          },
          offsetWidth: 1,
        },
      ],
    },
  });
  vm.runInContext(
    source.replace(/^import .+;\n/gm, "").replace(/^export /gm, "") +
      "\nglobalThis.WalletPanel = WalletPanel;",
    context
  );
  const panel = new context.WalletPanel();
  return {
    panel,
    audioManager,
    played,
    preloaded,
    setTime: (value) => {
      now = value;
    },
    setRandom: (value) => {
      random = value;
    },
    setReduced: (value) => {
      reduced = value;
    },
    drops: () => drops,
    fetched,
    setResponse: (response) => {
      fetchResponse = response;
    },
  };
}

test("wallet eagerly registers the three existing coin assets without waiting for loads", () => {
  const harness = walletAudio();
  for (const method of [
    "render",
    "setBalance",
    "setupPortalDrag",
    "setupRestoreDrag",
    "setTucked",
    "loadPage",
  ]) {
    harness.panel[method] = () => {};
  }
  harness.panel.init();
  assert.deepEqual(
    harness.preloaded.map(({ src }) => src),
    ["/audio/coin_drop_15.wav", "/audio/coin_drop_21.wav", "/audio/coin_drop_23.wav"]
  );
  for (const { src } of harness.preloaded) {
    assert.ok(fs.existsSync(path.join(__dirname, "../..", src)));
  }
  assert.equal(harness.played.length, 0);
});

test("coin choices vary without immediate repeats and all three can be selected", () => {
  const harness = walletAudio();
  harness.panel.playReward();
  harness.setTime(500);
  harness.panel.playReward();
  harness.setTime(1000);
  harness.setRandom(0.999);
  harness.panel.playReward();
  assert.deepEqual(harness.played, ["wallet-coin-15", "wallet-coin-21", "wallet-coin-23"]);
  assert.equal(harness.drops(), 3);
});

test("rapid rewards throttle only audio, allowing sound again at exactly 500 ms", () => {
  const harness = walletAudio();
  harness.panel.playReward();
  harness.setTime(499);
  harness.panel.playReward();
  assert.equal(harness.played.length, 1);
  assert.equal(harness.drops(), 2);
  harness.setTime(500);
  harness.panel.playReward();
  assert.equal(harness.played.length, 2);
  assert.equal(harness.drops(), 3);
});

test("mute keeps visuals and reduced motion suppresses both without consuming sound choices", () => {
  const harness = walletAudio();
  harness.audioManager.enabled = false;
  harness.panel.playReward();
  assert.equal(harness.played.length, 0);
  assert.equal(harness.drops(), 1);
  harness.audioManager.enabled = true;
  harness.setReduced(true);
  harness.panel.playReward();
  assert.equal(harness.played.length, 0);
  assert.equal(harness.drops(), 1);
  harness.setReduced(false);
  harness.panel.playReward();
  assert.deepEqual(harness.played, ["wallet-coin-15"]);
});

test("explicit activation shows confirmed credits and refreshes history", async () => {
  const harness = walletAudio();
  const updates = [];
  harness.panel.setBalance = (balance) => updates.push(balance);
  harness.panel.setStatus = (text) => updates.push(text);
  harness.panel.loadPage = async () => updates.push("refresh");
  await harness.panel.activateWallet();
  assert.equal(harness.fetched[0].url, "/api/wallet/activate");
  assert.equal(harness.fetched[0].options.method, "POST");
  assert.deepEqual(updates, [15000, "Your achievements added 150 brics.", "refresh"]);
  assert.equal(harness.played.length, 1);
  assert.equal(harness.panel.activating, false);
});

test("activation replay refreshes without replaying sound or credit feedback", async () => {
  const harness = walletAudio();
  harness.setResponse({
    ok: true,
    json: async () => ({
      status: "already_credited",
      amount: 0,
      balance: 15000,
    }),
  });
  let refreshed = false;
  harness.panel.loadPage = async () => {
    refreshed = true;
  };
  harness.panel.setBalance = () => assert.fail("replay must not announce credits");
  harness.panel.setStatus = () => assert.fail("replay must not announce credits");
  await harness.panel.activateWallet();
  assert.equal(refreshed, true);
  assert.equal(harness.played.length, 0);
});

test("activation errors are explicit and allow retry", async () => {
  const harness = walletAudio();
  harness.setResponse({ ok: false, json: async () => ({ error: "Credit failed" }) });
  const errors = [];
  harness.panel.setStatus = (text, tone) => errors.push([text, tone]);
  await harness.panel.activateWallet();
  assert.deepEqual(errors, [["Credit failed", "error"]]);
  assert.equal(harness.panel.activating, false);
  assert.equal(harness.played.length, 0);
});

test("refresh requested during a history load is queued rather than lost", async () => {
  const harness = walletAudio();
  harness.panel.busy = true;
  await harness.panel.loadPage(null);
  assert.equal(harness.panel.refreshPending, true);
  assert.equal(harness.fetched.length, 0);
});

test("activity cue appears only when more content remains below the scroll position", () => {
  const { panel } = walletAudio();
  panel.activityHint = { hidden: true };
  for (const [scrollHeight, clientHeight, scrollTop, hidden] of [
    [144, 144, 0, true],
    [360, 144, 0, false],
    [360, 144, 100, false],
    [360, 144, 214, true],
    [360, 144, 216, true],
    [360, 144, 220, true],
    [360, 144, 0, false],
  ]) {
    panel.activityEl = { scrollHeight, clientHeight, scrollTop };
    panel.updateActivityHint();
    assert.equal(panel.activityHint.hidden, hidden);
  }
});
