---
description: Coordinate multiple agents for complex tasks. Use for multi-perspective analysis, comprehensive reviews, or tasks requiring different domain expertise.
---

Orchestrate multiple agents for complex multi-domain tasks.

User request: $ARGUMENTS

## Task

Orchestrate specialized agents to solve this complex problem.

### Requirements

- **Minimum 3 different agents** for true orchestration
- 2-phase execution: Planning -> Implementation

### Phase 1: Planning (Sequential)

1. Create detailed plan
2. Get user approval before proceeding

### Phase 2: Implementation (Parallel agents after approval)

Invoke specialized agents as needed:
- Frontend development
- Backend/API development
- Database design
- Testing
- Security audit
- DevOps/deployment

### Exit Gates

Before completing:
1. Verify at least 3 agents were involved
2. Run verification scripts if available
3. Generate orchestration report

## Output Format

```markdown
## Orchestration Report

### Task
[Original task summary]

### Agents Invoked (MINIMUM 3)
| # | Agent | Focus Area | Status |
|---|-------|------------|--------|
| 1 | [agent] | [area] | [status] |
| 2 | [agent] | [area] | [status] |
| 3 | [agent] | [area] | [status] |

### Key Findings
1. **[Agent]**: [Finding]
2. **[Agent]**: [Finding]
3. **[Agent]**: [Finding]

### Deliverables
- [ ] Plan created
- [ ] Code implemented
- [ ] Tests passing

### Summary
[One paragraph synthesis]
```

Orchestrate: $ARGUMENTS
