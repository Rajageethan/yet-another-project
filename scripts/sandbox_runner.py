"""Runs reference solutions from the imported dataset on a list of inputs.

Reads a JSON job on stdin, writes JSON results on stdout. Started by
import_leetcode.py in a separate `python -I` process with a timeout, from an
empty working directory. Code has already passed a static check; here imports
are limited to an allowlist and file/exec builtins are removed.

job = {"codes": {"name": "<python source>"}, "method": "twoSum", "cases": [{...kwargs}]}
"""

import builtins
import copy
import json
import sys
import threading

ALLOWED_MODULES = {
    "typing", "collections", "itertools", "functools", "heapq", "bisect", "math", "string",
    "operator", "re", "random", "datetime", "fractions", "decimal", "statistics", "array", "copy",
}

PREAMBLE = """
from typing import *
from collections import *
from itertools import *
from functools import *
from heapq import *
from bisect import *
from math import *
from string import *
from operator import *
import math, collections, heapq, bisect, itertools, functools, string, re, random
inf = float('inf')
"""

_real_import = builtins.__import__


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level != 0 or name.split(".")[0] not in ALLOWED_MODULES:
        raise ImportError(f"import of {name!r} is not allowed")
    return _real_import(name, globals, locals, fromlist, level)


SAFE_BUILTINS = {k: v for k, v in vars(builtins).items() if k not in {
    "open", "exec", "eval", "compile", "input", "breakpoint", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "help", "exit", "quit", "memoryview",
}}
SAFE_BUILTINS["__import__"] = _guarded_import


def normalize(v):
    """Converts a result into JSON-safe data, or raises TypeError."""
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            raise TypeError("non-finite float")
        return v
    if isinstance(v, (list, tuple)):
        return [normalize(x) for x in v]
    raise TypeError(f"unsupported return type {type(v).__name__}")


def run_code(source, method, cases):
    ns = {"__builtins__": SAFE_BUILTINS, "__name__": "solution"}
    import random
    random.seed(0)
    try:
        exec(PREAMBLE, ns)
        exec(source, ns)
        sol_cls = ns["Solution"]
    except Exception as e:  # noqa: BLE001
        return {"load_error": f"{type(e).__name__}: {e}"}
    out = []
    for kwargs in cases:
        try:
            fn = getattr(sol_cls(), method)
            out.append({"ok": True, "out": normalize(fn(**copy.deepcopy(kwargs)))})
        except RecursionError:
            out.append({"ok": False, "err": "RecursionError"})
        except Exception as e:  # noqa: BLE001
            out.append({"ok": False, "err": f"{type(e).__name__}: {str(e)[:200]}"})
    return {"results": out}


def main():
    job = json.loads(sys.stdin.read())
    result = {}

    def work():
        for name, source in job["codes"].items():
            result[name] = run_code(source, job["method"], job["cases"])

    sys.setrecursionlimit(20000)
    for mb in (256, 128, 64):  # deep recursion needs a big thread stack; Windows caps the size
        try:
            threading.stack_size(mb * 1024 * 1024)
            break
        except ValueError:
            continue
    t = threading.Thread(target=work)
    t.start()
    t.join()
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
