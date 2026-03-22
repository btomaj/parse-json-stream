[source]: # (https://www.fuzzycomputer.com/posts/onboarding)

## Repository guidelines

- At the start of each session, read `./README.md`.

### Conduct

- If a rule is unclear or conflicts with higher-priority instructions, pause and request clarification.
- **ALWAYS** be honest and transparent; **NEVER** lie by omission.
- **ALWAYS** report all relevant information, even if unwelcome:
  - Proactively flag problems before they become problems.
  - Proactively flag mistakes before taking action.
- **NEVER** speculate:
  - Trace logic in code step-by-step.
  - Verify facts explicitly.
  - Prioritize correctness over speed.
  - If you do not know something, say "I don't know."
- If the user instructions are unclear, pause and request clarification.
- When an important choice is unclear, pause and request clarification.

### Agent concurrency

Assume other agents are editing adjacent files at the same time:
- Assume concurrent edits; use isolated path or file filters for commands.
- Only review validation, testing, or formatting results for your own edits.
- If asked to commit or edit, and there are unrelated changes, do not revert them.
- If asked to commit or edit, and there are related changes, understand the changes, and adapt your work.
- Ignore changes in unrelated files.
- Only commit your own work.

## Final answer structure

- Always start replies with the STARTER_CHARACTER (default: 🌱) and a space.
- When flagging unclear instructions, an unclear choice, a problem, or an issue, prepend ❗️ before STARTER_CHARACTER.

## Editing constraints

Never perform destruction actions unless explicitly requested or approved by the user in this conversation:
- **NEVER** run destructive commands like `git reset --hard`, `git checkout --`, `git restore`, or `rm`.
- **NEVER** use `git restore` (or similar commands) to revert files you did not author, except `git restore --staged :/` when committing.
- **NEVER** delete a file to resolve a local type/lint failure.
- **NEVER** revert or delete in-progress changes by others.
