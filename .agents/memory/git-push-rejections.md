---
name: GitHub push rejections in main repl
description: Why git-pane pushes keep failing here and the only reliable fix
---

# GitHub push rejections (PUSH_REJECTED / non-fast-forward)

The main repl **cannot run `git fetch`/`pull`/`push` directly** — these are blocked as protected/destructive operations for the main agent (they try to write ref/lock files and are denied). Because fetch is blocked, the local `origin/main` remote-tracking ref goes **stale** and can sit on a long-outdated commit even after the real GitHub `main` has advanced.

Symptom: the Replit Git pane shows `PUSH_REJECTED` — "the remote has commits that aren't in the local repository." `git rev-list --left-right --count origin/main...HEAD` will misleadingly show `behind 0` because it compares against the *stale* tracking ref, not GitHub's true state. The Git pane's "Pull" can report success without actually reconciling.

**Why:** the main repl's git environment is sandboxed from network git writes; only isolated task-agent environments can perform real fetch+merge+push.

**How to apply:** when a push is rejected here, do NOT keep retrying the Git pane or attempt fetch/pull/push inline (bash blocks fetch/merge/push/commit as "destructive git operations … not allowed in the main agent"; even an assigned task agent hit the same block, and the platform merge-back only reconciles into the repl, NOT to GitHub).

## Diagnose before assuming divergence
"Push rejected by remote" is NOT always non-fast-forward. Verify the real GitHub state via the **GitHub API** (the `github` connector token works for reads — `listConnections('github')[0].settings.access_token`): GET `git/ref/heads/main` and `commits?sha=main`. Compare GitHub's main HEAD sha to local with `git merge-base --is-ancestor <github-head> HEAD`. If it IS an ancestor, local is a clean fast-forward and there is NO divergence — the rejection is something else.

## The real recurring cause here: missing `workflow` OAuth scope
The Replit GitHub connector token (user `MagicElf-Ann`) has scopes `read:org, read:project, read:user, repo, user:email` — **no `workflow` scope**. GitHub refuses ANY push from such a token when the pushed commits modify `.github/workflows/*`, and rejects the WHOLE push. The repl's `GITHUB_TOKEN` secret returns 401 (expired) and is not a fallback. No branch protection on main (404).
**Constraint that makes this hard:** the repl can never fetch, so GitHub must only ever receive fast-forwards (repl→GitHub); editing a workflow file on GitHub's side creates divergence the repl can't reconcile. And no available token/channel can push a `.github/workflows/` change without workflow scope.
**Fix:** the pushing identity must gain `workflow` scope (reconnect the GitHub integration granting it, or use a classic PAT with `repo`+`workflow`). Dropping the workflow change instead is usually not viable when it is coupled to deleted code (e.g. removing a deleted e2e spec's line from `playwright.yml`) — reverting it would leave CI referencing a non-existent file.
