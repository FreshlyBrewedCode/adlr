---
name: github-workflow
description: Guidelines for working on GitHub. Use when interacting directly with GitHub (Issues, PRs). ALWAYS use when running in a GitHub actions environment.
---

# GitHub Workflow

## Responding in GitHub Actions

When running inside a GitHub Actions environment (`GITHUB_ACTIONS=true`), your normal text response is automatically posted as a comment on the triggering issue or PR by the action harness. **Do not manually post a comment back to the triggering issue** — just respond normally.

Use `gh issue comment` or `gh pr comment` only when you want to post to a **different** issue or PR than the one that triggered the action (e.g. posting a cross-reference on a related issue).

## Issue and PR descriptions / comments

When writing descriptions for issues, PRs, or comments and no specific template is provided, use the following style:

- A brief bullet point summary at the top
  - keep it short
  - sacrifice grammar if needed
  - provide relevant links/references
- One or more collapsible sections (details tag) below with more detailed information
  - Give meaningful titles for the sections
  - Split into multiple sections if they deserve their own title

Example:
```markdown
- brief summary
- in bullet points
- sacrifice grammar if needed

<details>
  <summary>Further information</summary>

  More detailed information structured into multiple <details> sections if needed.

</details>
```

## Issue-based development workflow

The full lifecycle for feature work uses four labeled issue types. Every issue follows the description/comment format above unless a specific template is shown below.

### Label taxonomy

| Label | Purpose |
|---|---|
| `brainstorming` | Root exploration issue; Q&A happens in comments |
| `spec` | Spec issue produced from brainstorming; contains the full design |
| `plan` | Implementation plan issue; owns task sub-issues |
| `task` | Sub-issue per top-level plan task; body contains subtask checkboxes |

Create these labels in the repo if they don't exist before using them.

### Issue templates

#### Brainstorming issue
Created manually by the user, or by the agent when explicitly asked to hand off an interactive session to async/comment-based mode.

```
title:  <feature name or question>
labels: brainstorming
body:   Problem statement / what we're exploring.
        (Agent adds a comment summarising the conversation state if converting from interactive mode.)
```

#### Spec issue
Created by the agent at the end of the brainstorming phase.

```
title:  Spec: <feature name>
labels: spec
body:   > Ref: #<brainstorming-issue>   (omit if no brainstorming issue exists)

        Full spec content: Goal, Architecture, Components,
        Data Flow, Error Handling, Testing approach.
```

After creating the spec issue, if a brainstorming issue exists, post a comment on it:
> `Spec written in #N — please review and reply here when you're happy to proceed.`

#### Plan issue
Created by the agent at the start of the writing-plans phase.

```
title:  Plan: <feature name>
labels: plan
body:   > Spec: #<spec-issue>

        **Goal:** one sentence

        **Architecture:** 2-3 sentences

        **Tech Stack:** key libraries/tools

        **File Structure:**
        - `path/to/file.ts` — responsibility
        - ...

        **Tasks:**
        - [ ] #A Task 1: <name>
        - [ ] #B Task 2: <name>
        ...
```

The task list is populated with sub-issue numbers after sub-issues are created (edit the issue body).

#### Task sub-issue
One per top-level plan task. Created as a sub-issue of the plan issue.

```
title:  [Plan #N] Task M: <Component Name>
labels: task
body:   Part of #<plan-issue>

        **Files:**
        - Create: `exact/path/to/file.ts`
        - Modify: `exact/path/to/existing.ts`
        - Test: `tests/exact/path/to/test.ts`

        - [ ] Step 1: description
        - [ ] Step 2: description
        ...
```

Create sub-issues with:
```bash
gh issue create \
  --title "[Plan #N] Task M: <name>" \
  --label task \
  --body "..." \
  --repo <owner>/<repo>
# Then link as sub-issue:
gh issue develop <sub-issue-number> --issue-repo <owner>/<repo>
# Or if native sub-issues are available:
# gh issue create ... --parent <plan-issue-number>
```

If the `--parent` flag is not available in the installed `gh` version, include `Part of #<plan-issue>` in the body and manually link via the GitHub UI or API.

### Issue linking conventions

| From | To | How |
|---|---|---|
| Brainstorming → Spec | Comment on brainstorming issue | `Spec written in #N` |
| Spec issue body | Brainstorming issue | `> Ref: #N` in body |
| Plan issue body | Spec issue | `> Spec: #N` in body |
| Task sub-issue body | Plan issue | `Part of #N` in body |
| PR description | Plan issue | `Implements plan #N` in body |

### Updating task progress

When a subtask step completes, update the sub-issue body to check the box:

```bash
# Fetch current body, toggle checkbox, update
BODY=$(gh issue view <sub-issue-number> --json body --jq '.body')
# (edit BODY to replace "- [ ] Step N" with "- [x] Step N")
gh issue edit <sub-issue-number> --body "$BODY"
```

When all checkboxes in a sub-issue are complete, close it:
```bash
gh issue close <sub-issue-number> --comment "All steps complete."
```

When all task sub-issues are closed, close the plan issue:
```bash
gh issue close <plan-issue-number> --comment "All tasks complete."
```
