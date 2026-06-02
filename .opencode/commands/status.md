---
description: Display agent and project status. Progress tracking and status board.
---

Show current project and agent status.

## What to Show

1. **Project Info**
   - Project name and path
   - Tech stack
   - Current features

2. **Status Board**
   - Completed tasks
   - Pending work

3. **File Statistics**
   - Files created count
   - Files modified count

4. **Preview Status**
   - Is server running
   - URL
   - Health check

## Example Output Format

```
=== Project Status ===

Project: [name]
Path: [path]
Type: [framework]
Status: active

Tech Stack:
   Framework: [framework]
   Database: [db]
   Auth: [auth]

Features (N):
   - [feature 1]
   - [feature 2]

Pending (N):
   - [pending 1]
   - [pending 2]

Files: [N] created, [N] modified

=== Preview ===

URL: http://localhost:[port]
Health: [OK/Down]
```

Show project status now.
