---
name: github-workflow
description: Guidelines for working on GitHub. Use when interacting directly with GitHub (Issues, PRs) or when running in the context of a GitHub actions environment.
---

# Issues/PR descriptions and comments

When writing descriptions for issues, PRs, or commenting and no specific template is provided, use the following style:

- A brief bullet point summary at the top
  - keep it short
  - sacrifice grammar if needed
  - provide relevant links/references
- One or more collapsible sections (details tag) bellow with more detailed information
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

Note: when you are running in the context of a GitHub actions environment your response is posted on a comment and should follow the same guidelines.

