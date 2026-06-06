---
name: grep/bash token mangling in this repl
description: bash grep/rg silently corrupts certain literal tokens in stdout, producing false "no matches" results
---

In this environment, bash `grep`/`rg` (and other shell stdout) silently MANGLES certain
literal tokens, dropping or rewriting characters so matches do not appear. Observed:
searching for the retired-feature tokens `reverse-trial` / `exit-offer` returned a false
"NONE REMAINING", and a search for `saved-summary` rendered the hit as `/api/n` (the
middle of the string was eaten).

**Why:** unknown shell/stdout filtering layer in this repl; it corrupts specific
substrings before they reach the tool output. It is NOT reliable to detect by eye —
it can turn a real match into a different-looking string or into nothing.

**How to apply:** Do NOT trust bash `grep`/`rg` output for presence/absence of these
tokens. Verify with the faithful paths instead:
- the `read` tool (shows true file contents),
- the `explore` subagent (reads files directly, returns faithful results),
- the `architect` code-review subagent with `includeGitDiff: true` (sees the real diff).
When doing a "did I remove every reference?" sweep, confirm with explore/architect, not grep.
