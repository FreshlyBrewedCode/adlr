# opencode Composite Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the opencode slash-command workflow into a reusable composite action, add GitHub App token acquisition via `adlr-action`, and fix the log size overflow from issue #21.

**Architecture:** Create `.github/actions/opencode/action.yml` (composite action) that encapsulates all logic; move `log2md.mjs` alongside it; rewrite `opencode.yml` as a thin caller that passes event context as inputs. Token acquisition uses `actions/create-github-app-token@v2` and the resulting token replaces `GITHUB_TOKEN` everywhere.

**Tech Stack:** GitHub Actions composite actions, `actions/create-github-app-token@v2`, `actions/checkout@v4`, `actions/github-script@v7`, Node.js ESM (`log2md.mjs`), Bun, `gh` CLI.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `.github/actions/opencode/action.yml` | **Create** | Full composite action: token acquisition, prompt building, opencode run, post response |
| `.github/actions/opencode/log2md.mjs` | **Move from** `.github/workflows/log2md.mjs` | Convert JSONL log to Markdown comment |
| `.github/workflows/opencode.yml` | **Modify** | Thin caller: trigger, guard, pass inputs to composite action |
| `.github/workflows/log2md.mjs` | **Delete** | Moved to action directory |

---

## Task 1: Move log2md.mjs into the action directory

**Files:**
- Create dir: `.github/actions/opencode/`
- Move: `.github/workflows/log2md.mjs` → `.github/actions/opencode/log2md.mjs`

- [ ] **Step 1: Create the action directory and move the script**

```bash
mkdir -p .github/actions/opencode
git mv .github/workflows/log2md.mjs .github/actions/opencode/log2md.mjs
```

- [ ] **Step 2: Verify the move**

```bash
ls .github/actions/opencode/
# Expected: log2md.mjs
ls .github/workflows/
# Expected: ci.yml  opencode-instructions.md  opencode.yml
# log2md.mjs should NOT be listed
```

- [ ] **Step 3: Commit**

```bash
git add .github/actions/opencode/log2md.mjs .github/workflows/log2md.mjs
git commit -m "chore: move log2md.mjs into actions/opencode directory"
```

---

## Task 2: Create the composite action

**Files:**
- Create: `.github/actions/opencode/action.yml`

- [ ] **Step 1: Create the composite action file**

Create `.github/actions/opencode/action.yml` with the following content:

```yaml
name: Run opencode
description: Run opencode in response to a slash-command comment and post the result

inputs:
  opencode-api-key:
    description: opencode API key
    required: true
  app-id:
    description: GitHub App ID for adlr-action
    required: true
  app-private-key:
    description: GitHub App private key PEM for adlr-action
    required: true
  model:
    description: opencode model to use
    required: false
    default: opencode-go/kimi-k2.7-code
  comment-body:
    description: Raw comment body containing the slash command
    required: true
  issue-number:
    description: Issue or PR number the comment is on
    required: true
  is-pr:
    description: "'true' if the comment is on a pull request, 'false' for an issue"
    required: true

runs:
  using: composite
  steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      with:
        persist-credentials: false

    - name: Setup Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version: "1.3"

    - name: Install opencode
      shell: bash
      run: npm install -g opencode-ai

    - name: Acquire app token
      id: app-token
      uses: actions/create-github-app-token@v2
      with:
        app-id: ${{ inputs.app-id }}
        private-key: ${{ inputs.app-private-key }}

    - name: Configure git credentials
      shell: bash
      env:
        APP_TOKEN: ${{ steps.app-token.outputs.token }}
      run: |
        git config --global url."https://x-access-token:${APP_TOKEN}@github.com/".insteadOf "https://github.com/"

    - name: Build prompt
      id: prompt
      uses: actions/github-script@v7
      with:
        comment-body: ${{ inputs.comment-body }}
        is-pr: ${{ inputs.is-pr }}
        issue-number: ${{ inputs.issue-number }}
        script: |
          const body = core.getInput('comment-body');
          const markerRegex = /(?:^|\s)(\/oc|\/opencode)(?=\s|$)/gi;
          const userPrompt = body.replace(markerRegex, ' ').replace(/\s+/g, ' ').trim();

          const isPR = core.getInput('is-pr') === 'true';
          const number = core.getInput('issue-number');

          const instructions = isPR
            ? `<context>You are responding to a comment on pull request #${number}</context>`
            : `<context>You are responding to a comment on issue #${number}</context>`;

          const fullPrompt = `${instructions}\n\n${userPrompt}`;
          core.setOutput('prompt', fullPrompt);

    - name: Run opencode
      id: opencode
      shell: bash
      env:
        OPENCODE_API_KEY: ${{ inputs.opencode-api-key }}
        GH_TOKEN: ${{ steps.app-token.outputs.token }}
        OPENCODE_MODEL: ${{ inputs.model }}
        OPENCODE_CONFIG_CONTENT: |
          {
            "permission": {
              "external_directory": {
                "*": "deny",
                "/tmp/**": "allow"
              }
            },
            "instructions": [".github/workflows/opencode-instructions.md"]
          }
      run: |
        log_file=$(mktemp /tmp/opencode-log-XXXXXX.jsonl)
        opencode run \
          --model "$OPENCODE_MODEL" \
          --format json \
          ${{ toJSON(steps.prompt.outputs.prompt) }} | tee "$log_file"
        echo "log_file=$log_file" >> "$GITHUB_OUTPUT"

    - name: Post response
      shell: bash
      env:
        GH_TOKEN: ${{ steps.app-token.outputs.token }}
        OPENCODE_MODEL: ${{ inputs.model }}
        LOG_FILE: ${{ steps.opencode.outputs.log_file }}
        IS_PR: ${{ inputs.is-pr }}
        ISSUE_NUMBER: ${{ inputs.issue-number }}
      run: |
        if [ "$IS_PR" = "true" ]; then
          target="pr"
        else
          target="issue"
        fi
        node "${{ github.action_path }}/log2md.mjs" "$LOG_FILE" "$OPENCODE_MODEL" opencode \
          | gh "$target" comment "$ISSUE_NUMBER" --body-file -
```

- [ ] **Step 2: Verify the file was created**

```bash
cat .github/actions/opencode/action.yml
# Should print the full YAML above with no truncation errors
```

- [ ] **Step 3: Commit**

```bash
git add .github/actions/opencode/action.yml
git commit -m "feat: add opencode composite action"
```

---

## Task 3: Rewrite opencode.yml as a thin caller

**Files:**
- Modify: `.github/workflows/opencode.yml`

- [ ] **Step 1: Replace the workflow content**

Replace the entire contents of `.github/workflows/opencode.yml` with:

```yaml
name: opencode

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: |
      (
        contains(github.event.comment.body, ' /oc') ||
        startsWith(github.event.comment.body, '/oc') ||
        contains(github.event.comment.body, ' /opencode') ||
        startsWith(github.event.comment.body, '/opencode')
      ) &&
      contains(fromJson('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run opencode
        uses: ./.github/actions/opencode
        with:
          opencode-api-key: ${{ secrets.OPENCODE_API_KEY }}
          app-id: ${{ secrets.ADLR_APP_ID }}
          app-private-key: ${{ secrets.ADLR_APP_PRIVATE_KEY }}
          comment-body: ${{ github.event.comment.body }}
          issue-number: ${{ github.event.issue.number || github.event.pull_request.number }}
          is-pr: ${{ toJSON(!!github.event.issue.pull_request || github.event_name == 'pull_request_review_comment') }}
```

> Note: The initial `Checkout repository` step in the workflow is required before `uses: ./.github/actions/opencode` so that Actions can read the local composite action definition. The composite action then runs its own checkout with `persist-credentials: false`.

> Note: `actions: write` permission is removed — it was only needed if the workflow triggered other workflows, which it does not.

- [ ] **Step 2: Verify the diff looks correct**

```bash
git diff .github/workflows/opencode.yml
# Confirm:
# - env: OPENCODE_MODEL block removed from job level
# - All the old steps (Setup Bun, Install opencode, Build prompt, Run opencode, Post response) replaced
# - Single "Run opencode" step using ./.github/actions/opencode
# - permissions no longer includes actions: write
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/opencode.yml
git commit -m "feat: convert opencode workflow to thin caller using composite action"
```

---

## Task 4: Validate YAML syntax

**Files:**
- Read: `.github/actions/opencode/action.yml`
- Read: `.github/workflows/opencode.yml`

- [ ] **Step 1: Check YAML syntax on both files**

```bash
npx js-yaml .github/actions/opencode/action.yml > /dev/null && echo "action.yml OK"
npx js-yaml .github/workflows/opencode.yml > /dev/null && echo "opencode.yml OK"
```

Expected output:
```
action.yml OK
opencode.yml OK
```

If either fails, fix the YAML error before continuing.

- [ ] **Step 2: Verify file structure is complete**

```bash
ls -la .github/actions/opencode/
# Expected:
# action.yml
# log2md.mjs

ls .github/workflows/
# Expected:
# ci.yml
# opencode-instructions.md
# opencode.yml
# (log2md.mjs should NOT be here)
```

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
git add .github/actions/opencode/action.yml .github/workflows/opencode.yml
git commit -m "fix: correct YAML syntax in opencode action"
# Skip this step if no changes were needed
```

---

## Task 5: Final review and notes

- [ ] **Step 1: Check for any remaining references to the old log2md path**

```bash
grep -r "workflows/log2md" .github/
# Should return no matches
```

- [ ] **Step 2: Check for any remaining GITHUB_TOKEN usage in the opencode workflow/action**

```bash
grep -r "GITHUB_TOKEN" .github/actions/opencode/ .github/workflows/opencode.yml
# Should return no matches — all token usage should now be via app-token
```

- [ ] **Step 3: Summarise required secrets for repo settings**

The following secrets must be added to the repository (Settings → Secrets → Actions) before the workflow runs successfully:

| Secret name | Value |
|---|---|
| `ADLR_APP_ID` | GitHub App ID from https://github.com/apps/adlr-action |
| `ADLR_APP_PRIVATE_KEY` | Private key PEM generated for the adlr-action GitHub App |

`OPENCODE_API_KEY` already exists.

- [ ] **Step 4: Final commit if anything was missed**

```bash
git status
# Should be clean. If not, commit any remaining changes.
```
