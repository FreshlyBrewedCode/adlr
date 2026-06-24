---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan from GitHub, review critically, execute all tasks, track progress via issue checkboxes, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents. The quality of its work will be significantly higher if run on a platform with subagent support (such as Claude Code or Codex). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan

Load the plan from GitHub:

```bash
# Get the plan issue (body contains goal, architecture, task list with sub-issue numbers)
gh issue view <plan-issue-number> --json number,title,body

# Get all task sub-issues
gh issue list --label task --search "Plan #<plan-issue-number>" --json number,title,body
# Or fetch each sub-issue by number from the plan's task list
```

For each task sub-issue, fetch its full body — that is the task content (files + checkbox steps).

Review critically:
- Identify any questions or concerns before starting
- If concerns: raise them with your human partner before proceeding
- If no concerns: create TodoWrite (one item per task sub-issue) and proceed

### Step 2: Execute Tasks

For each task sub-issue:
1. Mark the corresponding TodoWrite item as `in_progress`
2. Follow each checkbox step in the sub-issue body exactly
3. Run verifications as specified in the steps
4. After each step completes, update the sub-issue body to check the box:

```bash
# Fetch current body
BODY=$(gh issue view <sub-issue-number> --json body --jq '.body')
# Edit BODY: replace "- [ ] Step N" with "- [x] Step N" for the completed step
gh issue edit <sub-issue-number> --body "$BODY"
```

5. When all checkboxes in the sub-issue are checked, close it:

```bash
gh issue close <sub-issue-number> --comment "All steps complete."
```

6. Update the plan issue task list to reflect the closed sub-issue (edit `- [ ] #N` to `- [x] #N`):

```bash
PLAN_BODY=$(gh issue view <plan-issue-number> --json body --jq '.body')
# Edit PLAN_BODY: replace "- [ ] #<sub-issue-number>" with "- [x] #<sub-issue-number>"
gh issue edit <plan-issue-number> --body "$PLAN_BODY"
```

7. Mark the TodoWrite item as `completed`

### Step 3: Complete Development

After all task sub-issues are closed:

Close the plan issue:
```bash
gh issue close <plan-issue-number> --comment "All tasks complete."
```

Then:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan issue based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Update issue checkboxes as you go — this is the progress record
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Required workflow skills:**
- **superpowers:using-git-worktrees** - Ensures isolated workspace (creates one or verifies existing)
- **superpowers:writing-plans** - Creates the plan issue this skill executes
- **superpowers:finishing-a-development-branch** - Complete development after all tasks
