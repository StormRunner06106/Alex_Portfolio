# Agent instructions

## Automatic commits

- Automatically commit every repository change made to fulfill a user prompt before ending the task, unless the user explicitly instructs otherwise.
- Keep each commit focused on the corresponding prompt and use a clear commit message describing the changes.
- Run any relevant checks before committing and report their results.
- Stage only the files or hunks changed for the current prompt. Do not include unrelated or pre-existing changes.
- If a commit cannot be completed, explain the blocker and report any changes left uncommitted.
- Do not push commits unless the user requests it.

## Question lists

- When the user provides a list of questions, append the questions and answers
  to `answers.txt` as a separate group for that request.
- Use the company name as the group heading when available. If only job context
  is available, use the job title or context. If neither company nor job context
  is available, use "General questions".
- Restart question numbering at 1 within each group; do not continue numbering
  from previously answered groups.
- Wrap text in `answers.txt` at 80 characters per line to avoid horizontal
  scrolling.
