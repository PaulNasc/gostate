---
description: Add or update features in existing application. Used for iterative development.
---

Add features or make updates to an existing application.

User request: $ARGUMENTS

## Steps:

1. **Understand Current State**
   - Analyze existing codebase
   - Understand current features and tech stack

2. **Plan Changes**
   - Determine what will be added/changed
   - Detect affected files
   - Check dependencies

3. **Present Plan to User** (for major changes)
   - Summarize what will be created/modified
   - Ask for approval before proceeding

4. **Apply Changes**
   - Implement the requested changes
   - Make sure tests pass

5. **Update Preview**
   - Hot reload or restart server if needed

## Caution

- Get approval for major changes
- Warn on conflicting requests (e.g., "use Firebase" when project uses PostgreSQL)
- Commit each change with git when possible

Apply enhancement: $ARGUMENTS
