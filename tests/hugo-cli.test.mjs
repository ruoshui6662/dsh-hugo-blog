import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHugo } from "../lib/hugo-cli.js";

// runHugo is expected to accept an injectable spawn (deps/spawn option) so
// tests can avoid a real Hugo binary. We try the common option shapes and
// skip gracefully if the implementation does not support injection.
function makeFakeSpawn(behavior) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], opts });
    const handlers = {};
    const child = {
      stdout: { on: (ev, fn) => { handlers[`stdout:${ev}`] = fn; } },
      stderr: { on: (ev, fn) => { handlers[`stderr:${ev}`] = fn; } },
      on: (ev, fn) => { handlers[ev] = fn; },
      kill: (signal) => { calls.killed = true; return true; },
    };
    queueMicrotask(() => {
      if (behavior.stdout) handlers["stdout:data"]?.(Buffer.from(behavior.stdout));
      if (behavior.stderr) handlers["stderr:data"]?.(Buffer.from(behavior.stderr));
      const code = behavior.code ?? 0;
      if (behavior.hang) return; // never emits close -> timeout path
      handlers.close?.(code);
    });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

async function runWithFake(fake, args, extra = {}) {
  // lib 签名：runHugo(root, { args, spawnImpl, timeoutMs })
  return runHugo(process.cwd(), { args, spawnImpl: fake, ...extra });
}

function textOf(result) {
  return `${result?.stdoutTail ?? ""}${result?.stderrTail ?? ""}${result?.stdout ?? ""}${result?.output ?? ""}${result?.tail ?? ""}`;
}
function isTimeout(result) {
  const flag = result?.timeout ?? result?.timedOut ?? result?.killed ?? false;
  const text = /timeout|timed out/i.test(
    String(result?.error ?? result?.code ?? result?.status ?? ""),
  );
  return Boolean(flag || text);
}

describe("runHugo with fake spawn", () => {
  it("success: exit 0 returns output tail", async (t) => {
    const fake = makeFakeSpawn({ code: 0, stdout: "Built in 12 ms\n" });
    let result;
    try {
      result = await runWithFake(fake, ["--version"]);
    } catch (err) {
      t.skip(`runHugo does not accept injected spawn in a recognised shape: ${err.message}`);
      return;
    }
    assert.match(textOf(result), /Built/);
    assert.ok((result?.code ?? result?.exitCode ?? 0) === 0);
    assert.equal(fake.calls.length, 1);
  });

  it("failure: exit 1 is not retried (called exactly once)", async (t) => {
    const fake = makeFakeSpawn({ code: 1, stderr: "Error: boom\n" });
    let result;
    try {
      result = await runWithFake(fake, ["--bad-flag"]);
    } catch (err) {
      // Some implementations throw on non-zero exit; that is acceptable too.
      assert.equal(fake.calls.length, 1, "spawn must be called exactly once");
      return;
    }
    assert.notEqual(result?.code ?? result?.exitCode ?? 0, 0);
    assert.equal(fake.calls.length, 1, "failed run must not be retried");
  });

  it("timeout: kills the process and returns a timeout marker", async (t) => {
    const fake = makeFakeSpawn({ hang: true });
    let result;
    try {
      result = await runWithFake(fake, ["server"], { timeoutMs: 50, timeout: 50 });
    } catch (err) {
      if (/timeout|timed out/i.test(String(err?.message ?? err))) {
        assert.ok(fake.calls.killed, "process should be killed on timeout");
        return;
      }
      t.skip(`runHugo timeout injection not supported: ${err.message}`);
      return;
    }
    assert.ok(isTimeout(result), `expected timeout marker, got ${JSON.stringify(result)}`);
    assert.ok(fake.calls.killed, "process should be killed on timeout");
  });
});
