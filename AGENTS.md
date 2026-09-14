# Agent instructions

## Automatic commits

- Automatically commit every repository change made to fulfill a user prompt before ending the task, unless the user explicitly instructs otherwise.
- Keep each commit focused on the corresponding prompt and use a clear commit message describing the changes.
- Run any relevant checks before committing and report their results.
- Stage only the files or hunks changed for the current prompt. Do not include unrelated or pre-existing changes.
- If a commit cannot be completed, explain the blocker and report any changes left uncommitted.
- Do not push commits unless the user requests it.
