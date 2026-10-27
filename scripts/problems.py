"""Source of truth for the problem bank.

Each problem has hand-written visible tests and edge cases plus a reference
solution and a random generator. Running this script recomputes every expected
value from the reference solution, checks the hand-written ones, and writes
src/problems/bank.json.

    python scripts/problems.py
"""

import json
import random
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "problems" / "bank.json"

PROBLEMS = []


def problem(**meta):
    def wrap(fn):
        meta["ref"] = fn
        PROBLEMS.append(meta)
        return fn

    return wrap


def unique_pair_count(nums, target):
    return sum(
        1
        for i in range(len(nums))
        for j in range(i + 1, len(nums))
        if nums[i] + nums[j] == target
    )


# ---------------------------------------------------------------- Arrays & Hashing


def gen_pair_sum(rng):
    while True:
        n = rng.randint(2, 12)
        nums = [rng.randint(-20, 20) for _ in range(n)]
        i, j = sorted(rng.sample(range(n), 2))
        target = nums[i] + nums[j]
        if unique_pair_count(nums, target) == 1:
            return [nums, target]


@problem(
    slug="pair-with-target-sum",
    title="Pair With Target Sum",
    difficulty="easy",
    topic="arrays-hashing",
    pattern="Complement lookup",
    fn=("pair_with_sum", "pairWithSum"),
    params=["nums", "target"],
    statement=(
        "Given a list of integers `nums` and an integer `target`, return the indices `[i, j]` "
        "(with `i < j`) of the two numbers that add up to `target`.\n\n"
        "Exactly one valid pair exists. You may not use the same element twice."
    ),
    constraints=["2 ≤ len(nums) ≤ 10⁴", "-10⁹ ≤ nums[i], target ≤ 10⁹", "Exactly one answer exists"],
    visible=[([[2, 7, 11, 15], 9], [0, 1]), ([[3, 2, 4], 6], [1, 2]), ([[3, 3], 6], [0, 1])],
    edge=[[[-1, -2, -3, -4, -5], -8], [[0, 4, 3, 0], 0], [[1, 5, 9, -3], 6]],
    gen=gen_pair_sum,
    notes={
        "keyInsight": "For each number x, the only partner that works is target - x. Remember what you have seen in a hash map (value → index) so the check is O(1).",
        "bruteForce": "Try every pair i < j: O(n²) time, O(1) space.",
        "optimal": "One pass with a hash map: check whether target - x was seen before inserting x. O(n) time, O(n) space.",
        "commonMistakes": [
            "Inserting x before checking, so [3,2,4] with target 6 pairs 3 with itself",
            "Returning the values instead of the indices",
            "Returning indices in the wrong order",
        ],
        "edgeCases": ["Duplicate values ([3,3])", "Negative numbers", "Zeros"],
    },
)
def pair_with_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i


@problem(
    slug="duplicate-finder",
    title="Duplicate Finder",
    difficulty="easy",
    topic="arrays-hashing",
    pattern="Hash set membership",
    fn=("has_duplicate", "hasDuplicate"),
    params=["nums"],
    statement="Given a list of integers `nums`, return `true` if any value appears at least twice, and `false` if every value is distinct.",
    constraints=["0 ≤ len(nums) ≤ 10⁵", "-10⁹ ≤ nums[i] ≤ 10⁹"],
    visible=[([[1, 2, 3, 1]], True), ([[1, 2, 3, 4]], False), ([[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], True)],
    edge=[[[]], [[7]], [[0, 0]], [[-1, 1]]],
    gen=lambda rng: [[rng.randint(-15, 15) for _ in range(rng.randint(0, 10))]],
    notes={
        "keyInsight": "You only need to know whether you've seen a value before, so a set answers that in O(1).",
        "bruteForce": "Compare every pair: O(n²).",
        "optimal": "Sort and compare neighbours (O(n log n)), or a hash set (O(n) time, O(n) space).",
        "commonMistakes": ["Comparing adjacent elements without sorting first"],
        "edgeCases": ["Empty list", "Single element", "Negative numbers"],
    },
)
def has_duplicate(nums):
    return len(set(nums)) != len(nums)


def gen_anagram(rng):
    letters = "abcde"
    s = "".join(rng.choice(letters) for _ in range(rng.randint(0, 8)))
    t = list(s)
    rng.shuffle(t)
    if t and rng.random() < 0.5:
        t[rng.randrange(len(t))] = rng.choice(letters)
    if rng.random() < 0.15:
        t.append(rng.choice(letters))
    return [s, "".join(t)]


@problem(
    slug="anagram-check",
    title="Anagram Check",
    difficulty="easy",
    topic="arrays-hashing",
    pattern="Frequency counting",
    fn=("is_anagram", "isAnagram"),
    params=["s", "t"],
    statement="Given two strings `s` and `t` of lowercase letters, return `true` if `t` uses exactly the same letters as `s`, the same number of times each (in any order).",
    constraints=["0 ≤ len(s), len(t) ≤ 5·10⁴", "Only lowercase English letters"],
    visible=[(["listen", "silent"], True), (["rat", "car"], False), (["aab", "abb"], False)],
    edge=[["", ""], ["a", "ab"], ["abc", "cba"]],
    gen=gen_anagram,
    notes={
        "keyInsight": "Two strings are anagrams exactly when every letter has the same count in both.",
        "bruteForce": "Sort both strings and compare: O(n log n).",
        "optimal": "Count letters with a 26-slot array or hash map: O(n) time, O(1) extra space.",
        "commonMistakes": ["Comparing sets, which ignores counts (aab vs abb)", "Forgetting the length check"],
        "edgeCases": ["Empty strings", "Different lengths", "Repeated letters"],
    },
)
def is_anagram(s, t):
    return Counter(s) == Counter(t)


def gen_topk(rng):
    nums = [rng.randint(1, 8) for _ in range(rng.randint(1, 14))]
    k = rng.randint(1, len(set(nums)))
    return [nums, k]


@problem(
    slug="top-k-frequent",
    title="Most Frequent K",
    difficulty="medium",
    topic="arrays-hashing",
    pattern="Count, then bucket or sort",
    fn=("top_k_frequent", "topKFrequent"),
    params=["nums", "k"],
    statement=(
        "Given a list of integers `nums` and an integer `k`, return the `k` most frequent values.\n\n"
        "Order the result from most to least frequent. If two values are equally frequent, the smaller value comes first."
    ),
    constraints=["1 ≤ len(nums) ≤ 10⁵", "1 ≤ k ≤ number of distinct values"],
    visible=[([[1, 1, 1, 2, 2, 3], 2], [1, 2]), ([[4], 1], [4]), ([[5, 3, 5, 3, 1], 2], [3, 5])],
    edge=[[[2, 2, 1, 1], 2], [[9, 8, 7], 3]],
    gen=gen_topk,
    notes={
        "keyInsight": "First count every value; then the question becomes ordering values by count. Buckets indexed by count avoid a full sort.",
        "bruteForce": "Count, then sort all distinct values by (-count, value): O(n log n).",
        "optimal": "Bucket sort by frequency: O(n). A heap of size k gives O(n log k).",
        "commonMistakes": ["Ignoring the tie-break rule", "Returning counts instead of values"],
        "edgeCases": ["k equals the number of distinct values", "All values equally frequent"],
    },
)
def top_k_frequent(nums, k):
    c = Counter(nums)
    return sorted(c, key=lambda v: (-c[v], v))[:k]


# ---------------------------------------------------------------- Two Pointers


def gen_palindrome(rng):
    chars = "abA B,.1"
    half = "".join(rng.choice(chars) for _ in range(rng.randint(0, 5)))
    s = half + "".join(rng.choice(chars) for _ in range(rng.randint(0, 1))) + half[::-1]
    if s and rng.random() < 0.4:
        s = s[: len(s) // 2] + rng.choice("xyz") + s[len(s) // 2 + 1 :]
    return [s]


@problem(
    slug="palindrome-check",
    title="Clean Palindrome",
    difficulty="easy",
    topic="two-pointers",
    pattern="Converging pointers",
    fn=("is_palindrome", "isPalindrome"),
    params=["s"],
    statement=(
        "Given a string `s`, return `true` if it reads the same forwards and backwards after ignoring "
        "uppercase/lowercase differences and skipping every character that is not a letter or digit."
    ),
    constraints=["0 ≤ len(s) ≤ 2·10⁵", "Printable ASCII characters"],
    visible=[(["Never odd or even"], True), (["race a car"], False), ([" "], True)],
    edge=[[""], ["a."], ["0P"], ["ab_a"]],
    gen=gen_palindrome,
    notes={
        "keyInsight": "Compare from both ends inward, skipping characters that don't count; no need to build a cleaned copy.",
        "bruteForce": "Build a cleaned lowercase string and compare it with its reverse: O(n) time, O(n) space.",
        "optimal": "Two pointers from both ends, skipping non-alphanumerics: O(n) time, O(1) space.",
        "commonMistakes": ["Forgetting digits count as alphanumeric", "Not lowercasing", "Pointers crossing without a check"],
        "edgeCases": ["Empty string", "Only punctuation", "Mixed digits and letters (0P)"],
    },
)
def is_palindrome(s):
    t = [c.lower() for c in s if c.isalnum()]
    return t == t[::-1]


def gen_pair_sorted(rng):
    while True:
        nums = sorted(rng.randint(-15, 25) for _ in range(rng.randint(2, 12)))
        i, j = sorted(rng.sample(range(len(nums)), 2))
        target = nums[i] + nums[j]
        if unique_pair_count(nums, target) == 1:
            return [nums, target]


@problem(
    slug="pair-sum-sorted",
    title="Pair Sum, Sorted",
    difficulty="easy",
    topic="two-pointers",
    pattern="Converging pointers",
    fn=("pair_sum_sorted", "pairSumSorted"),
    params=["nums", "target"],
    statement=(
        "`nums` is sorted in non-decreasing order. Return the indices `[i, j]` (with `i < j`) of the two "
        "numbers that add up to `target`.\n\nExactly one valid pair exists. Try to use O(1) extra space."
    ),
    constraints=["2 ≤ len(nums) ≤ 3·10⁴", "nums is sorted", "Exactly one answer exists"],
    visible=[([[2, 7, 11, 15], 9], [0, 1]), ([[1, 2, 3, 4, 6], 6], [1, 3]), ([[-3, -1, 0, 2, 5], 4], [1, 4])],
    edge=[[[1, 1], 2], [[-5, -4, 0, 10], -9]],
    gen=gen_pair_sorted,
    notes={
        "keyInsight": "Because the list is sorted, if the current sum is too small only moving the left pointer right can help; if too big, only moving the right pointer left can.",
        "bruteForce": "All pairs O(n²), or a hash map O(n) time with O(n) space.",
        "optimal": "Two pointers at both ends moving inward: O(n) time, O(1) space.",
        "commonMistakes": ["Moving the wrong pointer", "Ignoring that the input is sorted"],
        "edgeCases": ["Two-element list", "Negative numbers", "Duplicates"],
    },
)
def pair_sum_sorted(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1


@problem(
    slug="three-sum-zero",
    title="Zero-Sum Triplets",
    difficulty="medium",
    topic="two-pointers",
    pattern="Sort + two pointers",
    fn=("three_sum", "threeSum"),
    params=["nums"],
    statement=(
        "Given a list of integers `nums`, return every unique triplet of values `[a, b, c]` taken from three "
        "different positions such that `a + b + c == 0`.\n\n"
        "Write each triplet in ascending order (`a ≤ b ≤ c`). No triplet may appear twice. The triplets themselves can be in any order."
    ),
    constraints=["0 ≤ len(nums) ≤ 3000", "-10⁵ ≤ nums[i] ≤ 10⁵"],
    visible=[([[-1, 0, 1, 2, -1, -4]], [[-1, -1, 2], [-1, 0, 1]]), ([[0, 1, 1]], []), ([[0, 0, 0]], [[0, 0, 0]])],
    edge=[[[]], [[0, 0, 0, 0]], [[-2, 0, 1, 1, 2]]],
    gen=lambda rng: [[rng.randint(-6, 6) for _ in range(rng.randint(0, 14))]],
    compare="unordered",
    notes={
        "keyInsight": "Sort first. Fix one value, then the remaining two form a sorted pair-sum problem solved with two pointers. Sorting also makes skipping duplicates easy.",
        "bruteForce": "Try every triple and deduplicate with a set: O(n³).",
        "optimal": "Sort, then for each i run two pointers on the rest, skipping repeated values: O(n²) time.",
        "commonMistakes": ["Returning duplicate triplets", "Skipping duplicates before using the first occurrence", "Not sorting each triplet"],
        "edgeCases": ["All zeros", "Fewer than three numbers", "Many repeated values"],
    },
)
def three_sum(nums):
    nums = sorted(nums)
    res = []
    for i in range(len(nums)):
        if i and nums[i] == nums[i - 1]:
            continue
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                res.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1
                hi -= 1
    return res


@problem(
    slug="container-most-water",
    title="Widest Water Tank",
    difficulty="medium",
    topic="two-pointers",
    pattern="Greedy converging pointers",
    fn=("max_water", "maxWater"),
    params=["heights"],
    statement=(
        "`heights[i]` is the height of a vertical wall at position `i`. Pick two walls; together with the "
        "ground they hold water up to the height of the shorter wall.\n\n"
        "Return the largest amount of water any pair can hold: `min(heights[i], heights[j]) * (j - i)`."
    ),
    constraints=["2 ≤ len(heights) ≤ 10⁵", "0 ≤ heights[i] ≤ 10⁴"],
    visible=[([[1, 8, 6, 2, 5, 4, 8, 3, 7]], 49), ([[1, 1]], 1), ([[4, 3, 2, 1, 4]], 16)],
    edge=[[[0, 0]], [[1, 2, 1]], [[2, 3, 10, 5, 7, 8, 9]]],
    gen=lambda rng: [[rng.randint(0, 12) for _ in range(rng.randint(2, 15))]],
    notes={
        "keyInsight": "Start with the widest pair. The shorter wall limits the area, so moving the taller wall inward can never help; always move the shorter one.",
        "bruteForce": "Check every pair: O(n²).",
        "optimal": "Two pointers from both ends, moving the shorter wall: O(n).",
        "commonMistakes": ["Moving the taller wall", "Using the taller wall's height in the area"],
        "edgeCases": ["Zero heights", "Equal heights"],
    },
)
def max_water(heights):
    lo, hi, best = 0, len(heights) - 1, 0
    while lo < hi:
        best = max(best, min(heights[lo], heights[hi]) * (hi - lo))
        if heights[lo] < heights[hi]:
            lo += 1
        else:
            hi -= 1
    return best


# ---------------------------------------------------------------- Sliding Window


def gen_window_k(rng):
    nums = [rng.randint(-10, 15) for _ in range(rng.randint(1, 14))]
    return [nums, rng.randint(1, len(nums))]


@problem(
    slug="max-sum-window-k",
    title="Max Sum Window of K",
    difficulty="easy",
    topic="sliding-window",
    pattern="Fixed-size sliding window",
    fn=("max_window_sum", "maxWindowSum"),
    params=["nums", "k"],
    statement="Given a list of integers `nums` and an integer `k`, return the largest sum of any `k` consecutive elements.",
    constraints=["1 ≤ k ≤ len(nums) ≤ 10⁵", "-10⁴ ≤ nums[i] ≤ 10⁴"],
    visible=[([[2, 1, 5, 1, 3, 2], 3], 9), ([[5], 1], 5), ([[-1, -2, -3], 2], -3)],
    edge=[[[4, -1, 4], 3], [[0, 0, 0], 1]],
    gen=gen_window_k,
    notes={
        "keyInsight": "Neighbouring windows share k-1 elements. Add the one that enters and subtract the one that leaves instead of re-summing.",
        "bruteForce": "Sum every window from scratch: O(n·k).",
        "optimal": "Keep a running window sum: O(n) time, O(1) space.",
        "commonMistakes": ["Starting best at 0 when all numbers are negative", "Off-by-one when removing the leaving element"],
        "edgeCases": ["k = 1", "k = len(nums)", "All negative"],
    },
)
def max_window_sum(nums, k):
    cur = sum(nums[:k])
    best = cur
    for i in range(k, len(nums)):
        cur += nums[i] - nums[i - k]
        best = max(best, cur)
    return best


@problem(
    slug="longest-unique-stretch",
    title="Longest Unique Stretch",
    difficulty="medium",
    topic="sliding-window",
    pattern="Variable-size sliding window",
    fn=("longest_unique", "longestUnique"),
    params=["s"],
    statement="Given a string `s`, return the length of the longest substring in which no character repeats.",
    constraints=["0 ≤ len(s) ≤ 5·10⁴", "Letters, digits, symbols and spaces"],
    visible=[(["abcabcbb"], 3), (["bbbbb"], 1), (["pwwkew"], 3), (["abba"], 2)],
    edge=[[""], [" "], ["dvdf"], ["tmmzuxt"], ["au"]],
    gen=lambda rng: ["".join(rng.choice("abcd") for _ in range(rng.randint(0, 14)))],
    notes={
        "keyInsight": "Keep a window with no repeats. When a repeat enters, jump the left edge just past the earlier copy, but never move it backwards: left = max(left, last[ch] + 1).",
        "bruteForce": "Check every substring for repeats: O(n³), or O(n²) with a set.",
        "optimal": "Sliding window with a map of last-seen index: O(n) time, O(k) space for k distinct characters.",
        "commonMistakes": ["Moving left backwards when the earlier copy is already outside the window (abba)", "Window length off by one (right - left + 1)"],
        "edgeCases": ["Empty string", "All same character", "abba", "Space characters"],
    },
)
def longest_unique(s):
    last, left, best = {}, 0, 0
    for right, ch in enumerate(s):
        if ch in last:
            left = max(left, last[ch] + 1)
        last[ch] = right
        best = max(best, right - left + 1)
    return best


@problem(
    slug="best-time-buy-sell",
    title="One Trade Profit",
    difficulty="easy",
    topic="sliding-window",
    pattern="Running minimum",
    fn=("max_profit", "maxProfit"),
    params=["prices"],
    statement=(
        "`prices[i]` is a stock's price on day `i`. You may buy once and later sell once. "
        "Return the maximum profit, or `0` if no profitable trade exists."
    ),
    constraints=["1 ≤ len(prices) ≤ 10⁵", "0 ≤ prices[i] ≤ 10⁴"],
    visible=[([[7, 1, 5, 3, 6, 4]], 5), ([[7, 6, 4, 3, 1]], 0), ([[2, 4, 1]], 2)],
    edge=[[[5]], [[1, 2]], [[3, 3, 3]]],
    gen=lambda rng: [[rng.randint(0, 20) for _ in range(rng.randint(1, 15))]],
    notes={
        "keyInsight": "For each selling day, the best buy is the cheapest price seen before it. Track that minimum as you go.",
        "bruteForce": "Try every buy/sell pair: O(n²).",
        "optimal": "One pass keeping the minimum so far: O(n) time, O(1) space.",
        "commonMistakes": ["Using global max - global min (selling before buying)", "Returning a negative profit"],
        "edgeCases": ["Single day", "Strictly decreasing prices"],
    },
)
def max_profit(prices):
    lo, best = prices[0], 0
    for p in prices:
        lo = min(lo, p)
        best = max(best, p - lo)
    return best


def gen_repeat(rng):
    return ["".join(rng.choice("ABC") for _ in range(rng.randint(1, 14))), rng.randint(0, 3)]


@problem(
    slug="longest-repeat-replace",
    title="Longest Repeat With Edits",
    difficulty="medium",
    topic="sliding-window",
    pattern="Variable window with a validity condition",
    fn=("longest_repeat", "longestRepeat"),
    params=["s", "k"],
    statement=(
        "`s` contains only uppercase letters. You may change at most `k` characters to any other uppercase letter. "
        "Return the length of the longest substring that can be made of a single repeated letter."
    ),
    constraints=["1 ≤ len(s) ≤ 10⁵", "0 ≤ k ≤ len(s)"],
    visible=[(["ABAB", 2], 4), (["AABABBA", 1], 4), (["AAAA", 0], 4)],
    edge=[["A", 0], ["ABC", 0], ["ABCDE", 5]],
    gen=gen_repeat,
    notes={
        "keyInsight": "A window is fixable when (window length − count of its most common letter) ≤ k. Grow the window, and shrink from the left only when that breaks.",
        "bruteForce": "Check every substring with letter counts: O(n²·26).",
        "optimal": "Sliding window with letter counts and the max count: O(n).",
        "commonMistakes": ["Shrinking with a while loop that over-shrinks", "Forgetting k can be 0"],
        "edgeCases": ["k = 0", "k ≥ len(s)", "Single character"],
    },
)
def longest_repeat(s, k):
    counts, left, best, top = Counter(), 0, 0, 0
    for right, ch in enumerate(s):
        counts[ch] += 1
        top = max(top, counts[ch])
        while right - left + 1 - top > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best


# ---------------------------------------------------------------- Stack


def gen_brackets(rng):
    return ["".join(rng.choice("()[]{}") for _ in range(rng.choice([0, 2, 4, 6, 8, 3, 5])))] if rng.random() < 0.5 else [balanced_string(rng, rng.randint(0, 4))]


def balanced_string(rng, depth):
    if depth == 0:
        return ""
    o, c = rng.choice(["()", "[]", "{}"])
    return o + balanced_string(rng, depth - 1) + c + (balanced_string(rng, rng.randint(0, depth - 1)) if rng.random() < 0.5 else "")


@problem(
    slug="balanced-brackets",
    title="Balanced Brackets",
    difficulty="easy",
    topic="stack",
    pattern="Stack of open brackets",
    fn=("is_balanced", "isBalanced"),
    params=["s"],
    statement=(
        "`s` contains only the characters `()[]{}`. Return `true` if every opening bracket is closed by the same type "
        "of bracket, in the correct order."
    ),
    constraints=["0 ≤ len(s) ≤ 10⁴"],
    visible=[(["()[]{}"], True), (["([)]"], False), (["{[]}"], True)],
    edge=[[""], ["("], [")("], ["(("], ["]"]],
    gen=gen_brackets,
    notes={
        "keyInsight": "The most recent unclosed bracket must be closed first, which is exactly last-in, first-out: a stack.",
        "bruteForce": "Repeatedly delete adjacent matching pairs until nothing changes: O(n²).",
        "optimal": "Push openers; on a closer, the top must match. Empty at the end. O(n).",
        "commonMistakes": ["Counting brackets instead of ordering them (fails ([)])", "Popping an empty stack", "Not checking the stack is empty at the end"],
        "edgeCases": ["Empty string", "Starts with a closer", "Only openers"],
    },
)
def is_balanced(s):
    pairs, st = {")": "(", "]": "[", "}": "{"}, []
    for ch in s:
        if ch in pairs:
            if not st or st.pop() != pairs[ch]:
                return False
        else:
            st.append(ch)
    return not st


@problem(
    slug="next-warmer-day",
    title="Next Warmer Day",
    difficulty="medium",
    topic="stack",
    pattern="Monotonic stack",
    fn=("days_until_warmer", "daysUntilWarmer"),
    params=["temps"],
    statement=(
        "`temps[i]` is the temperature on day `i`. For each day, return how many days you must wait for a strictly "
        "warmer day. Use `0` if no warmer day comes."
    ),
    constraints=["1 ≤ len(temps) ≤ 10⁵", "30 ≤ temps[i] ≤ 100"],
    visible=[([[73, 74, 75, 71, 69, 72, 76, 73]], [1, 1, 4, 2, 1, 1, 0, 0]), ([[30, 40, 50, 60]], [1, 1, 1, 0]), ([[30, 60, 90]], [1, 1, 0])],
    edge=[[[50]], [[70, 70, 70]], [[90, 80, 70, 100]]],
    gen=lambda rng: [[rng.randint(30, 45) for _ in range(rng.randint(1, 15))]],
    notes={
        "keyInsight": "Keep a stack of days still waiting for a warmer day; their temperatures are decreasing. Each new day resolves every waiting day colder than it.",
        "bruteForce": "For each day scan forward: O(n²).",
        "optimal": "Monotonic decreasing stack of indices: each index is pushed and popped once, O(n).",
        "commonMistakes": ["Storing temperatures instead of indices", "Treating equal temperatures as warmer"],
        "edgeCases": ["Single day", "All equal", "Strictly decreasing then a peak"],
    },
)
def days_until_warmer(temps):
    res, st = [0] * len(temps), []
    for i, t in enumerate(temps):
        while st and temps[st[-1]] < t:
            j = st.pop()
            res[j] = i - j
        st.append(i)
    return res


def trunc_div(a, b):
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def gen_rpn(rng):
    def build(depth):
        if depth == 0 or rng.random() < 0.3:
            v = rng.randint(-9, 12)
            return [str(v)], v
        lt, lv = build(depth - 1)
        rt, rv = build(depth - 1)
        op = rng.choice("+-*/")
        if op == "/" and rv == 0:
            op = "+"
        val = {"+": lv + rv, "-": lv - rv, "*": lv * rv}.get(op) if op != "/" else trunc_div(lv, rv)
        return lt + rt + [op], val

    return [build(rng.randint(1, 3))[0]]


@problem(
    slug="evaluate-rpn",
    title="Postfix Calculator",
    difficulty="medium",
    topic="stack",
    pattern="Operand stack",
    fn=("eval_rpn", "evalRpn"),
    params=["tokens"],
    statement=(
        "`tokens` is an arithmetic expression in postfix (Reverse Polish) notation: each operator `+ - * /` comes "
        "after its two operands. Return the value as an integer.\n\n"
        "Division truncates toward zero (`7 / -2 = -3`). The expression is always valid and never divides by zero."
    ),
    constraints=["1 ≤ len(tokens) ≤ 10⁴", "Operands are integers in [-200, 200]"],
    visible=[([["2", "1", "+", "3", "*"]], 9), ([["4", "13", "5", "/", "+"]], 6), ([["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], 22)],
    edge=[[["3"]], [["7", "-2", "/"]], [["-7", "2", "/"]], [["5", "8", "-"]]],
    gen=gen_rpn,
    notes={
        "keyInsight": "Operands wait on a stack until an operator arrives; the operator always applies to the two most recent values.",
        "bruteForce": "Repeatedly find the first operator, evaluate it in place and rebuild the list: O(n²).",
        "optimal": "One pass with a stack: O(n).",
        "commonMistakes": ["Swapping operand order for - and /", "Python // floors toward −∞; use int(a / b)", "Treating '-11' as an operator"],
        "edgeCases": ["Single number", "Negative division", "Negative operands"],
    },
)
def eval_rpn(tokens):
    st = []
    for tok in tokens:
        if tok in "+-*/" and len(tok) == 1:
            b, a = st.pop(), st.pop()
            st.append({"+": a + b, "-": a - b, "*": a * b}[tok] if tok != "/" else trunc_div(a, b))
        else:
            st.append(int(tok))
    return st[0]


@problem(
    slug="remove-adjacent-duplicates",
    title="Pair Eraser",
    difficulty="easy",
    topic="stack",
    pattern="Stack as a cancelling buffer",
    fn=("remove_pairs", "removePairs"),
    params=["s"],
    statement=(
        "Given a string `s` of lowercase letters, repeatedly delete any two adjacent equal letters until no such pair is left. "
        "Return the final string (the result is unique)."
    ),
    constraints=["1 ≤ len(s) ≤ 10⁵"],
    visible=[(["abbaca"], "ca"), (["azxxzy"], "ay"), (["aa"], "")],
    edge=[["a"], ["abba"], ["abcabc"]],
    gen=lambda rng: ["".join(rng.choice("abc") for _ in range(rng.randint(1, 14)))],
    notes={
        "keyInsight": "A new letter can only cancel with the letter just before it in the cleaned result, which is the top of a stack.",
        "bruteForce": "Scan and delete one pair at a time until stable: O(n²).",
        "optimal": "Stack: pop if the top equals the current letter, else push. O(n).",
        "commonMistakes": ["Only one pass of deletion (misses cascades like abba)"],
        "edgeCases": ["Everything cancels", "Nothing cancels"],
    },
)
def remove_pairs(s):
    st = []
    for ch in s:
        if st and st[-1] == ch:
            st.pop()
        else:
            st.append(ch)
    return "".join(st)


# ---------------------------------------------------------------- Binary Search


def gen_search(rng):
    nums = sorted(rng.sample(range(-30, 40), rng.randint(0, 12)))
    target = rng.choice(nums) if nums and rng.random() < 0.6 else rng.randint(-32, 42)
    return [nums, target]


@problem(
    slug="binary-search-index",
    title="Find in Sorted List",
    difficulty="easy",
    topic="binary-search",
    pattern="Classic binary search",
    fn=("search", "search"),
    params=["nums", "target"],
    statement=(
        "`nums` is sorted in ascending order with no duplicates. Return the index of `target`, or `-1` if it is not present.\n\n"
        "Aim for O(log n) time."
    ),
    constraints=["0 ≤ len(nums) ≤ 10⁴", "All values are distinct"],
    visible=[([[-1, 0, 3, 5, 9, 12], 9], 4), ([[-1, 0, 3, 5, 9, 12], 2], -1), ([[5], 5], 0)],
    edge=[[[], 1], [[1, 2], 2], [[1, 2], 0], [[1, 2, 3], 4]],
    gen=gen_search,
    notes={
        "keyInsight": "Comparing with the middle element throws away half of the remaining range every step.",
        "bruteForce": "Linear scan: O(n).",
        "optimal": "Binary search with lo <= hi: O(log n).",
        "commonMistakes": ["lo < hi vs lo <= hi mismatch", "Infinite loop from lo = mid", "Not handling an empty list"],
        "edgeCases": ["Empty list", "Target at either end", "Target outside the range"],
    },
)
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


@problem(
    slug="search-insert-position",
    title="Insert Position",
    difficulty="easy",
    topic="binary-search",
    pattern="Lower bound",
    fn=("insert_position", "insertPosition"),
    params=["nums", "target"],
    statement=(
        "`nums` is sorted in ascending order with no duplicates. Return the index of `target` if present; otherwise "
        "return the index where it would be inserted to keep the list sorted.\n\nAim for O(log n) time."
    ),
    constraints=["0 ≤ len(nums) ≤ 10⁴", "All values are distinct"],
    visible=[([[1, 3, 5, 6], 5], 2), ([[1, 3, 5, 6], 2], 1), ([[1, 3, 5, 6], 7], 4)],
    edge=[[[1], 0], [[], 3], [[1, 3], 3], [[2, 4, 6], 1]],
    gen=gen_search,
    notes={
        "keyInsight": "You want the first index whose value is ≥ target. Binary search can find that boundary directly.",
        "bruteForce": "Scan until nums[i] >= target: O(n).",
        "optimal": "Lower-bound binary search with lo < hi and hi = len(nums): O(log n).",
        "commonMistakes": ["Returning -1 when absent", "Off-by-one when the target is larger than everything"],
        "edgeCases": ["Empty list", "Insert at the front", "Insert at the end"],
    },
)
def insert_position(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


def gen_rotated(rng):
    base = sorted(rng.sample(range(-20, 40), rng.randint(1, 12)))
    r = rng.randrange(len(base))
    nums = base[r:] + base[:r]
    target = rng.choice(nums) if rng.random() < 0.6 else rng.randint(-22, 42)
    return [nums, target]


@problem(
    slug="rotated-array-search",
    title="Rotated List Search",
    difficulty="medium",
    topic="binary-search",
    pattern="Binary search on the sorted half",
    fn=("search_rotated", "searchRotated"),
    params=["nums", "target"],
    statement=(
        "A sorted list of distinct integers was rotated at an unknown point (for example `[0,1,2,4,5,6,7]` became "
        "`[4,5,6,7,0,1,2]`). Return the index of `target` in `nums`, or `-1`.\n\nAim for O(log n) time."
    ),
    constraints=["1 ≤ len(nums) ≤ 5000", "All values are distinct"],
    visible=[([[4, 5, 6, 7, 0, 1, 2], 0], 4), ([[4, 5, 6, 7, 0, 1, 2], 3], -1), ([[1], 0], -1)],
    edge=[[[1], 1], [[3, 1], 1], [[5, 1, 3], 5], [[1, 3], 3]],
    gen=gen_rotated,
    notes={
        "keyInsight": "Whichever middle you pick, at least one half (left or right of mid) is properly sorted. Check whether the target lies inside that sorted half to decide where to go.",
        "bruteForce": "Linear scan: O(n).",
        "optimal": "Modified binary search: O(log n).",
        "commonMistakes": ["Using < instead of <= when testing nums[lo] <= nums[mid]", "Wrong range check for the sorted half"],
        "edgeCases": ["Not rotated at all", "Two elements", "Target is the pivot"],
    },
)
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1


def gen_speed(rng):
    piles = [rng.randint(1, 50) for _ in range(rng.randint(1, 8))]
    return [piles, rng.randint(len(piles), len(piles) + 10)]


@problem(
    slug="min-eating-speed",
    title="Snack Speed",
    difficulty="medium",
    topic="binary-search",
    pattern="Binary search on the answer",
    fn=("min_speed", "minSpeed"),
    params=["piles", "h"],
    statement=(
        "There are snack piles, `piles[i]` snacks in pile `i`. Each hour you pick one pile and eat up to `k` snacks "
        "from it (if it has fewer, you finish it and wait out the hour).\n\n"
        "Return the smallest integer speed `k` that lets you finish every pile within `h` hours."
    ),
    constraints=["1 ≤ len(piles) ≤ h ≤ 10⁹", "1 ≤ piles[i] ≤ 10⁹"],
    visible=[([[3, 6, 7, 11], 8], 4), ([[30, 11, 23, 4, 20], 5], 30), ([[30, 11, 23, 4, 20], 6], 23)],
    edge=[[[1], 1], [[1000000000], 2], [[5, 5, 5], 15]],
    gen=gen_speed,
    notes={
        "keyInsight": "If speed k works, every faster speed works too. That monotonic yes/no lets you binary search over k instead of over the list.",
        "bruteForce": "Try k = 1, 2, 3 … up to max(piles): O(max · n).",
        "optimal": "Binary search k in [1, max(piles)], checking sum(ceil(p / k)) ≤ h: O(n log max).",
        "commonMistakes": ["Using p // k instead of ceil(p / k)", "Starting the search at 0", "Returning lo/hi inconsistently"],
        "edgeCases": ["One pile", "h equals number of piles", "Very large piles"],
    },
)
def min_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if sum((p + mid - 1) // mid for p in piles) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo


# ---------------------------------------------------------------- build


def canon(value, compare):
    if compare == "unordered":
        return sorted(json.dumps(v) for v in value)
    return value


def starter(meta):
    py, js = meta["fn"]
    params = meta["params"]
    return {
        "python": f"def {py}({', '.join(params)}):\n    pass\n",
        "javascript": f"function {js}({', '.join(params)}) {{\n  \n}}\n",
    }


def build():
    out = []
    for meta in PROBLEMS:
        ref = meta["ref"]
        compare = meta.get("compare", "exact")
        rng = random.Random(meta["slug"])

        visible = []
        for args, expected in meta["visible"]:
            got = ref(*json.loads(json.dumps(args)))
            assert canon(got, compare) == canon(expected, compare), (meta["slug"], args, got, expected)
            visible.append({"args": args, "expected": got})

        hidden_args = [a for a in meta["edge"]]
        seen = {json.dumps(t["args"]) for t in visible} | {json.dumps(a) for a in hidden_args}
        tries = 0
        while len(hidden_args) < 12 and tries < 500:
            tries += 1
            args = meta["gen"](rng)
            key = json.dumps(args)
            if key not in seen:
                seen.add(key)
                hidden_args.append(args)
        hidden = [{"args": a, "expected": ref(*json.loads(json.dumps(a)))} for a in hidden_args]

        out.append(
            {
                "slug": meta["slug"],
                "title": meta["title"],
                "difficulty": meta["difficulty"],
                "topic": meta["topic"],
                "pattern": meta["pattern"],
                "statement": meta["statement"],
                "constraints": meta["constraints"],
                "functionName": {"python": meta["fn"][0], "javascript": meta["fn"][1]},
                "params": meta["params"],
                "starter": starter(meta),
                "compare": compare,
                "tests": visible,
                "hiddenTests": hidden,
                "mentorNotes": meta["notes"],
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(out)} problems, {sum(len(p['hiddenTests']) for p in out)} hidden tests -> {OUT}")


if __name__ == "__main__":
    build()
