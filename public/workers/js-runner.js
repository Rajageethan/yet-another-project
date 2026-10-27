/* Runs student JavaScript in an isolated worker, one test case at a time. */
function show(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

self.postMessage({ type: "ready" });

self.onmessage = (e) => {
  const { id, code, fnName, tests } = e.data;
  const logs = [];
  const fakeConsole = {
    log: (...a) => logs.push(a.map(show).join(" ")),
    error: (...a) => logs.push(a.map(show).join(" ")),
    warn: (...a) => logs.push(a.map(show).join(" ")),
    info: (...a) => logs.push(a.map(show).join(" ")),
  };
  const started = performance.now();
  let fn;
  try {
    fn = new Function(
      "console",
      `"use strict";\n${code}\n;return typeof ${fnName} === "function" ? ${fnName} : undefined;`,
    )(fakeConsole);
  } catch (err) {
    self.postMessage({ type: "result", id, result: { cases: [], error: `${err.name}: ${err.message}`, stdout: logs.join("\n") } });
    return;
  }
  if (typeof fn !== "function") {
    self.postMessage({ type: "result", id, result: { cases: [], error: `Define a function named ${fnName}(...)`, stdout: logs.join("\n") } });
    return;
  }
  const cases = tests.map((t) => {
    try {
      const got = fn(...structuredClone(t.args));
      return { args: t.args, expected: t.expected, got: got === undefined ? null : JSON.parse(JSON.stringify(got)) };
    } catch (err) {
      return { args: t.args, expected: t.expected, error: `${err && err.name}: ${err && err.message}` };
    }
  });
  self.postMessage({
    type: "result",
    id,
    result: { cases, stdout: logs.join("\n").slice(0, 4000), ms: Math.round(performance.now() - started) },
  });
};
