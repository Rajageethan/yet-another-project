"""Imports problems from LeetCodeDataset (Apache-2.0) as drafts for review.

    python -I scripts/import_leetcode.py --per-topic 8

Download the dataset first (≈100 MB) into .cache/leetcodedataset/:
    https://huggingface.co/datasets/newfacade/LeetCodeDataset

For each candidate problem:
  1. Map LeetCode tags to one roadmap topic; skip linked lists / trees / design problems
     (the browser runner only passes JSON values) and "return any valid answer" problems.
  2. Parse every dataset input into keyword args (literals only).
  3. Run the dataset's reference solution AND its independent second solution in a
     sandboxed subprocess. Keep a test only when the dataset output, the reference and
     the second solution all agree. This drops the dataset's bad outputs and inputs
     that violate the problem's constraints.
  4. Write scripts/imports/lc-<id>.json with status "pending" and no draft yet.
     The original LeetCode wording goes to .cache/ only (it is not ours to publish).

Rewritten statements and mentor notes are drafted later on the in-app review page
(/admin/review), where you edit and approve each problem.
"""

import argparse
import ast
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNNER = Path(__file__).resolve().parent / "sandbox_runner.py"

# Most specific first: a problem tagged both "Array" and "Sliding Window" is a sliding-window problem.
TAG_TO_TOPIC = [
    ("Sliding Window", "sliding-window"),
    ("Monotonic Stack", "stack"),
    ("Stack", "stack"),
    ("Binary Search", "binary-search"),
    ("Two Pointers", "two-pointers"),
    ("Heap (Priority Queue)", "heaps"),
    ("Graph", "graphs"),
    ("Breadth-First Search", "graphs"),
    ("Union Find", "graphs"),
    ("Topological Sort", "graphs"),
    ("Dynamic Programming", "dp"),
    ("Hash Table", "arrays-hashing"),
    ("Counting", "arrays-hashing"),
    ("Prefix Sum", "arrays-hashing"),
    ("Array", "arrays-hashing"),
    ("String", "arrays-hashing"),
]
SKIP_TAGS = {"Linked List", "Tree", "Binary Tree", "Binary Search Tree", "Design", "Database", "Shell", "Concurrency", "Interactive"}

# LeetCode ids already covered by the hand-written bank (scripts/problems.py).
COVERED_IDS = {1, 217, 242, 347, 125, 167, 15, 11, 3, 121, 424, 20, 739, 150, 1047, 704, 35, 33, 875}

AMBIGUOUS = re.compile(
    r"return any|any (?:one )?of (?:them|the)\b|any valid|any possible|multiple (?:valid )?(?:answers|solutions)|"
    r"if there are (?:several|multiple)|in-place|do not return anything|modify .* in place",
    re.I,
)
ANY_ORDER = re.compile(r"in any order|any order|\b(?:return|find|generate|list) all (?:the )?(?:possible|unique|distinct|valid|combinations|permutations|subsets)", re.I)

ALLOWED_MODULES = {
    "typing", "collections", "itertools", "functools", "heapq", "bisect", "math", "string",
    "operator", "re", "random", "datetime", "fractions", "decimal", "statistics", "array", "copy",
}
BANNED_NAMES = {
    "open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "__builtins__", "exit", "quit", "help", "memoryview",
}
ALLOWED_DUNDERS = {
    "__init__", "__lt__", "__le__", "__gt__", "__ge__", "__eq__", "__ne__", "__hash__", "__repr__",
    "__str__", "__len__", "__iter__", "__next__", "__getitem__", "__setitem__", "__contains__",
    "__call__", "__add__", "__sub__", "__mul__", "__bool__",
}
JS_SAFE_INT = 2**53 - 1
MAX_CASE_CHARS = 20_000
VISIBLE, HIDDEN = 3, 15


def code_is_safe(source):
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(a.name.split(".")[0] not in ALLOWED_MODULES for a in node.names):
                return False
        elif isinstance(node, ast.ImportFrom):
            if node.level or (node.module or "").split(".")[0] not in ALLOWED_MODULES:
                return False
        elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            return False
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr not in ALLOWED_DUNDERS:
            return False
    return True


def extract_response_code(response):
    blocks = re.findall(r"```(?:python|py)?\n(.*?)```", response or "", re.S)
    blocks = [b for b in blocks if "class Solution" in b]
    return blocks[-1] if blocks else None


def signature(starter):
    """(method name, [param names]) from the starter code's class Solution method."""
    tree = ast.parse(starter + "pass\n")
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            params = [a.arg for a in node.args.args if a.arg != "self"]
            annotations = ast.unparse(node)
            return node.name, params, annotations
    return None, [], ""


def parse_input(text, params):
    try:
        call = ast.parse(f"f({text})", mode="eval").body
    except SyntaxError:
        return None
    if not isinstance(call, ast.Call) or call.args:
        return None
    kwargs = {}
    for kw in call.keywords:
        try:
            kwargs[kw.arg] = ast.literal_eval(kw.value)
        except (ValueError, SyntaxError, TypeError):
            return None
    if sorted(kwargs) != sorted(params):
        return None
    return {p: kwargs[p] for p in params}


def parse_output(text):
    try:
        return ast.literal_eval(text)
    except (ValueError, SyntaxError, TypeError):
        return None


def to_json_value(v):
    if isinstance(v, tuple):
        v = list(v)
    if isinstance(v, list):
        return [to_json_value(x) for x in v]
    return v


def deep_sort(v):
    if isinstance(v, list):
        items = [deep_sort(x) for x in v]
        return sorted(items, key=lambda x: json.dumps(x, sort_keys=True))
    return v


def canon(v, compare):
    v = to_json_value(v)
    if isinstance(v, float):
        return round(v, 5)
    if compare == "unordered_deep":
        return deep_sort(v)
    return v


def js_safe(v):
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return True
    if isinstance(v, int):
        return abs(v) <= JS_SAFE_INT
    if isinstance(v, float):
        return True
    if isinstance(v, (list, tuple)):
        return all(js_safe(x) for x in v)
    return False  # dicts, sets, Ellipsis, complex… can't round-trip through JSON args


def run_sandboxed(codes, method, cases, timeout):
    job = json.dumps({"codes": codes, "method": method, "cases": cases})
    env = {"PATH": os.environ.get("PATH", ""), "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}
    with tempfile.TemporaryDirectory() as tmp:
        try:
            proc = subprocess.run(
                [sys.executable, "-I", str(RUNNER)],
                input=job, capture_output=True, text=True, timeout=timeout, cwd=tmp, env=env,
            )
        except subprocess.TimeoutExpired:
            return None, "timeout"
    if proc.returncode != 0:
        return None, (proc.stderr or "runner failed").strip().splitlines()[-1][:200]
    try:
        return json.loads(proc.stdout), None
    except json.JSONDecodeError:
        return None, "bad runner output"


def snake(name):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def pick_tests(cases):
    """3 small-but-typical cases are visible (the tiniest ones are edge cases, better kept hidden);
    up to 15 others, spread across sizes and including the smallest and largest, are hidden."""
    cases = sorted(cases, key=lambda c: len(json.dumps(c["args"])) + len(json.dumps(c["expected"])))
    n = len(cases)
    picks = sorted({min(n - 1, max(0, round(n * f))) for f in (0.2, 0.3, 0.4)})
    while len(picks) < min(VISIBLE, n):
        picks = sorted(set(picks) | {next(i for i in range(n) if i not in picks)})
    visible = [cases[i] for i in picks]
    rest = [c for i, c in enumerate(cases) if i not in picks]
    if len(rest) > HIDDEN:
        step = len(rest) / HIDDEN
        rest = [rest[int(i * step)] for i in range(HIDDEN - 1)] + [rest[-1]]
    return visible, rest


def topic_for(tags):
    for tag, topic in TAG_TO_TOPIC:
        if tag in tags:
            return topic
    return None


def process(row, args):
    """Returns (record, reason). record is None when the problem is skipped."""
    m = re.fullmatch(r"Solution\(\)\.(\w+)", row.get("entry_point", ""))
    if not m:
        return None, "not a single-function problem"
    method = m.group(1)
    if set(row["tags"]) & SKIP_TAGS:
        return None, "needs linked list / tree / design support"
    if row["question_id"] in COVERED_IDS:
        return None, "already in the hand-written bank"
    if AMBIGUOUS.search(row["problem_description"]):
        return None, "accepts multiple valid answers / in-place"
    topic = topic_for(row["tags"])
    if not topic or (args.topics and topic not in args.topics):
        return None, "topic not selected"

    name, params, sig = signature(row["starter_code"])
    if name != method or not params:
        return None, "could not read the signature"
    if re.search(r"\b(ListNode|TreeNode|Node)\b", sig):
        return None, "uses node types"

    compare = "unordered_deep" if ANY_ORDER.search(row["problem_description"]) else "exact"

    parsed = []
    for io in row["input_output"]:
        kwargs = parse_input(io["input"], params)
        expected = parse_output(io["output"])
        if kwargs is None or expected is None:
            continue
        if not js_safe(list(kwargs.values())) or not js_safe(expected) or len(json.dumps(kwargs)) > MAX_CASE_CHARS:
            continue
        parsed.append((kwargs, expected))
    if len(parsed) < 8:
        return None, f"only {len(parsed)} usable inputs"

    codes = {"reference": row["completion"]}
    second = extract_response_code(row.get("response"))
    if second and code_is_safe(second):
        codes["second"] = second
    if not code_is_safe(codes["reference"]):
        return None, "reference solution failed the safety check"

    out, err = run_sandboxed(codes, method, [k for k, _ in parsed], args.timeout)
    if err:
        return None, f"sandbox: {err}"
    ref = out["reference"]
    if "load_error" in ref:
        return None, f"reference failed to load: {ref['load_error']}"
    sec = out.get("second", {}).get("results") if "second" in out and "load_error" not in out["second"] else None

    kept = []
    for i, (kwargs, expected) in enumerate(parsed):
        r = ref["results"][i]
        if not r["ok"] or r["out"] is None:
            continue
        got = canon(r["out"], compare)
        if got != canon(expected, compare):
            continue
        if sec is not None and (not sec[i]["ok"] or canon(sec[i]["out"], compare) != got):
            continue
        if len(json.dumps(r["out"])) > MAX_CASE_CHARS:
            continue
        kept.append({"args": [kwargs[p] for p in params], "expected": to_json_value(r["out"])})

    agreement = len(kept) / len(parsed)
    if len(kept) < 8 or agreement < 0.6:
        return None, f"only {len(kept)}/{len(parsed)} tests agreed (ambiguous or bad data)"

    # Dedupe by args
    seen, unique = set(), []
    for c in kept:
        key = json.dumps(c["args"])
        if key not in seen:
            seen.add(key)
            unique.append(c)
    visible, hidden = pick_tests(unique)

    qid = row["question_id"]
    record = {
        "id": f"lc-{qid}",
        "status": "pending",
        "source": {
            "dataset": "newfacade/LeetCodeDataset",
            "license": "Apache-2.0",
            "questionId": qid,
            "taskId": row["task_id"],
            "tags": row["tags"],
        },
        "difficulty": row["difficulty"].lower(),
        "topic": topic,
        "functionName": {"python": snake(method), "javascript": method},
        "params": params,
        "compare": compare,
        "tests": visible,
        "hiddenTests": hidden,
        "verification": {
            "datasetCases": len(row["input_output"]),
            "parsedCases": len(parsed),
            "agreedCases": len(kept),
            "secondSolution": sec is not None,
        },
        "referenceSolution": row["completion"],
        "draft": None,
    }
    original = {"title": row["task_id"].replace("-", " ").title(), "description": row["problem_description"]}
    return (record, original), None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(ROOT / ".cache" / "leetcodedataset"))
    ap.add_argument("--out", default=str(ROOT / "scripts" / "imports"))
    ap.add_argument("--per-topic", type=int, default=8, help="new problems to import per topic")
    ap.add_argument("--topics", type=lambda s: [t.strip() for t in s.split(",") if t.strip()], default=None)
    ap.add_argument("--difficulty", default="easy,medium", help="comma list of easy,medium,hard")
    ap.add_argument("--ids", type=lambda s: {int(x) for x in s.split(",")}, default=None, help="only these question ids")
    ap.add_argument("--timeout", type=int, default=40, help="seconds per problem in the sandbox")
    args = ap.parse_args()

    data = Path(args.data)
    files = sorted(data.glob("LeetCodeDataset-*.jsonl"))
    if not files:
        sys.exit(f"No dataset files in {data}. Download them from https://huggingface.co/datasets/newfacade/LeetCodeDataset")
    rows = [json.loads(line) for f in files for line in f.open(encoding="utf-8")]
    rows.sort(key=lambda r: r["question_id"])  # older ids first: the classic problems

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    originals = data / "originals"
    originals.mkdir(exist_ok=True)

    existing = {json.loads(p.read_text(encoding="utf-8"))["source"]["questionId"]: json.loads(p.read_text(encoding="utf-8")) for p in out_dir.glob("lc-*.json")}
    counts = {}
    for rec in existing.values():
        if rec["status"] != "rejected":
            counts[rec["topic"]] = counts.get(rec["topic"], 0) + 1
    difficulties = set(args.difficulty.split(","))

    imported, skipped = [], {}
    for row in rows:
        qid = row["question_id"]
        if qid in existing or row["difficulty"].lower() not in difficulties:
            continue
        if args.ids and qid not in args.ids:
            continue
        topic = topic_for(row["tags"])
        if not args.ids and (not topic or counts.get(topic, 0) >= args.per_topic):
            continue
        result, reason = process(row, args)
        if reason:
            skipped[reason.split(":")[0]] = skipped.get(reason.split(":")[0], 0) + 1
            continue
        record, original = result
        (out_dir / f"{record['id']}.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        (originals / f"{record['id']}.json").write_text(json.dumps(original, ensure_ascii=False), encoding="utf-8")
        counts[record["topic"]] = counts.get(record["topic"], 0) + 1
        v = record["verification"]
        imported.append(record["id"])
        print(f"  + {record['id']:<9} {record['topic']:<15} {record['difficulty']:<6} {row['task_id']}  ({v['agreedCases']}/{v['parsedCases']} tests agreed)")

    print(f"\nImported {len(imported)} problems as pending drafts into {out_dir}")
    for reason, n in sorted(skipped.items(), key=lambda x: -x[1]):
        print(f"  skipped {n:>4}: {reason}")
    print("Per topic:", ", ".join(f"{t} {n}" for t, n in sorted(counts.items())))


if __name__ == "__main__":
    main()
