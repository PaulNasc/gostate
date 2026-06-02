---
description: Advanced multi-agent coordination with parallel dispatch and synthesis. Use for complex tasks requiring multiple specialist perspectives.
---

Coordinate multiple agents for a complex task.

User request: $ARGUMENTS

## Task

Decompose the request into subtasks and coordinate execution.

1. **DECOMPOSE** - Break task into worker subtasks
2. **CLASSIFY** - Mark each subtask: Research | Implementation | Verification
3. **DISPATCH** - Launch appropriate tasks
4. **SYNTHESIZE** - Combine results into unified response
5. **VERIFY** - Ensure completeness before reporting

## Rules

- Phase-based execution: Research -> Synthesis -> Implementation -> Verification
- Never delegate understanding - maintain full context
- Parallel reads, sequential writes
- Start with 2-3 tasks, add more after synthesis if needed

Coordinate task: $ARGUMENTS
