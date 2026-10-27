/* Runs student Python in Pyodide, one test case at a time. Classic worker. */
const PYODIDE = "https://cdn.jsdelivr.net/npm/pyodide@0.29.4/";
importScripts(PYODIDE + "pyodide.js");

const HELPER = `
import json as __json
def __run_case(__f, __args_json):
    return __json.dumps(__f(*__json.loads(__args_json)))
`;

let out = [];
const ready = loadPyodide({ indexURL: PYODIDE }).then((py) => {
  py.setStdout({ batched: (s) => out.push(s) });
  py.setStderr({ batched: (s) => out.push(s) });
  self.postMessage({ type: "ready" });
  return py;
});
ready.catch((err) => self.postMessage({ type: "load_error", error: String(err) }));

function pyError(err) {
  const text = String((err && err.message) || err);
  const lines = text.trim().split("\n");
  // Keep the user's frames ("<exec>") and the final error line.
  const keep = [];
  const last = lines.length - 1;
  for (let i = 0; i < last; i++) {
    if (lines[i].includes('File "<exec>"') && !lines[i].includes("__run_case")) {
      keep.push(lines[i].replace('File "<exec>"', "solution.py").trim());
      const next = lines[i + 1];
      if (i + 1 < last && next && !next.trim().startsWith("File")) keep.push("    " + next.trim());
    }
  }
  keep.push(lines[lines.length - 1]);
  return keep.slice(-5).join("\n");
}

self.onmessage = async (e) => {
  const { id, code, fnName, tests } = e.data;
  const py = await ready;
  out = [];
  const started = performance.now();
  const ns = py.globals.get("dict")();
  try {
    py.runPython(HELPER, { globals: ns });
    try {
      py.runPython(code, { globals: ns });
    } catch (err) {
      self.postMessage({ type: "result", id, result: { cases: [], error: pyError(err), stdout: out.join("\n") } });
      return;
    }
    const fn = ns.get(fnName);
    if (typeof fn !== "function") {
      if (fn && fn.destroy) fn.destroy();
      self.postMessage({
        type: "result",
        id,
        result: { cases: [], error: `Define a function named ${fnName}(...)`, stdout: out.join("\n") },
      });
      return;
    }
    const runCase = ns.get("__run_case");
    const cases = tests.map((t) => {
      try {
        const got = JSON.parse(runCase(fn, JSON.stringify(t.args)));
        return { args: t.args, expected: t.expected, got };
      } catch (err) {
        return { args: t.args, expected: t.expected, error: pyError(err) };
      }
    });
    runCase.destroy();
    fn.destroy();
    self.postMessage({
      type: "result",
      id,
      result: { cases, stdout: out.join("\n").slice(0, 4000), ms: Math.round(performance.now() - started) },
    });
  } finally {
    ns.destroy();
  }
};
