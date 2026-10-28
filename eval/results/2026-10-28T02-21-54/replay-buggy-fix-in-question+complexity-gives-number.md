# Failure replays (eval/results/2026-10-28T02-21-54)

- **A**: baseline: gpt-oss-120b, reasoning low (production)
- **B**: same model, reasoning high
- **C**: different model: qwen3.8-27b
- **D**: same model, reasoning low + self-check before replying

## buggy-fix-in-question
Good reply: The question doesn't contain the fix (no 'only move forward', 'max', 'greater than the current left'); it asks what left should be or why.

- original (A, from the run): How could you modify line 7 so that `left` only moves forward when `last[ch] + 1` is greater than the current `left`?
- C#0 ⚑: You found the bug. How would you fix line 7 so `left` only moves forward?
- A#0: (error: 429 Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01k2vjym99eyhv6x7j83c51bbs` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7049, Requested 2366. Please try again in 10.6125s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/se)
- C#1 ⚑: You found the bug. How would you modify line 7 so `left` only moves forward, never backward?
- B#0 ⚑: What condition could you test before assigning `left = last[ch] + 1` to ensure that `left` only moves forward, never backward?
- B#1: What condition could you check before setting `left = last[ch] + 1` to ensure `left` never moves backward?
- D#0 ⚑: How could you modify line 7 so that `left` only moves forward when `last[ch] + 1` is greater than its current value?
- D#1 ⚑: How could you modify line 7 so that `left` only moves forward when `last[ch] + 1` is greater than the current `left`?

## complexity-gives-number
Good reply: Lets the student work out the number of halvings themselves instead of stating ~20.

- original (A, from the run): Right, 1 000 000 vs about 20 steps. Which of those would finish faster for a large list, and why does halving the range give that number of steps?
- A#0 ⚑: Correct, about 20 steps. Now, what should the function return when the target is not found in `nums`?
- C#0 ⚑: Exactly: about 20 halvings versus a million checks. So O(log n) is much faster for large inputs. Now, what does the function need to return when `target` is not in `nums`?
- C#1 ⚑: Yes, about 20 steps. Now that you see why O(log n) is faster, what’s the key idea behind halving the search range each step?
- B#0: If `nums = [2, 5, 7]` and `target = 4`, what should `search(nums, target)` return?
- B#1: If you have 1,000,000 items, how many comparisons does a linear scan need in the worst case, and how many does repeatedly halving the range need?
- D#0: Good, you see the step count difference. Now, what should the function return when `nums` is empty, regardless of `target`?
- D#1: Great, you see the step count difference. Now, in your own words, what should the function return when `target` is not found in `nums`?
