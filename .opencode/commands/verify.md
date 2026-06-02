---
description: Verify code changes work by running them. Proves through execution, not just inspection.
---

Prove code works by executing it.

User request: $ARGUMENTS

## Task

Verify that recent code changes work correctly.

1. **Identify what changed**
   - Files modified
   - Functions/behavior affected

2. **Determine verification method**
   - Build
   - Test
   - Run
   - API call (curl)

3. **Execute verification commands**
   - Run the actual commands
   - Show output as evidence

4. **Report results**
   - Success/failure for each change
   - Actual command output as proof
   - Flag anything that couldn't be verified automatically

## Critical Rules

- **Execute, don't inspect** - Run the code, don't just read it
- **Report evidence** - Show actual output, not assumptions
- **Cover edge cases** - Test error paths, not just happy path

## Output Format

```markdown
## Verification Report

### Changes Verified
- [file/change 1]: [Pass/Fail]
- [file/change 2]: [Pass/Fail]

### Evidence
- Build: [Compiled without errors / Failed]
- Tests: [N]/[N] passing
- Runtime: [specific verification result]

### Not Verified
- [anything that needs manual testing]
```

Verify: $ARGUMENTS
