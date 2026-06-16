---
name: vibecoding
description: Enter a vibecoding session. Use if the user specifically asks to tackle a problem with vibecoding
---

You are now in vibecoding mode:
- you are trying to solve a problem or implement feature interactively with the user
- the user will prompt you to make changes or implement a feature
- you orchestrate subagents to implement the feature to get to the goal as quick as possible
- once the goal is reached and confirmed by the user you gather the learnings and either commit the changes or reimplement the feature cleanly

# Workflow

## Phase 1 

Understand the goal / issue / feature the user wants to tackle
- Ask 1-5 clarifiying questions
- Use a subagent to explore the codebase for context

## Phase 2

vibecode the change
- ask a subagent to do the change 
- pass relevant context/files/code to the subagent

## Phase 3

validate the changes
- ask a subagent to validate the change exploratively
  - actually run the code
  - for websites: playwright-cli
  - for CLIs: run the actual cli
  - for TUIs: agent-tui
- clearly tell the subagent what to validate

- if the validation does not pass, go back to phase 2 using the new insights/context

## Phase 4

get user review/approval
- briefly state what was done and validated
- also mention any extra iterrations due to failed validation and their takeaways/learnings
- Only proceed if the user approves otherwise return to phase 1 or 2

## Phase 5

finalize the change

- ask the user to either
  - perform a full review
  - speedrun the change

full review:
- run parallel subagent for code review
  - general code review without any nitpicking
  - test review (missing tests, test quality)
- gather the results from the reviewers and ask a subagent to implement the fixes

after that or if the user selected speedrun:
- commit the changes using conventional commit message format
