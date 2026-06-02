---
description: Save information to persistent memory for cross-session recall. Stores preferences, conventions, decisions, and context.
---

Save information to persistent memory.

User request: $ARGUMENTS

## Task

Save the user's information for future sessions.

1. **Classify the information type**
   - user | feedback | project | reference

2. **Save to appropriate location**
   - Create or update memory file
   - Keep index updated

3. **Confirm to user**
   - What was saved
   - Where it was saved
   - That it will be available in future sessions

## Rules

- Never auto-delete memories
- Keep index entries concise
- Don't save information derivable from code
- Don't save temporary debug context

Save to memory: $ARGUMENTS
