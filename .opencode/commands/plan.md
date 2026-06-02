---
description: Create project plan using project-planner agent. No code writing - only plan file generation.
---

Create a project plan. NO CODE WRITING - plan file only.

User request: $ARGUMENTS

## Task

Create a detailed project plan based on the user's request.

1. **Context Check**
   - Ask clarifying questions if needed
   - Understand scope and constraints

2. **Socratic Gate**
   - Make sure requirements are clear

3. **Create Plan**
   - Task breakdown
   - Agent assignments
   - Verification checklist
   - Save to `docs/PLAN-{task-slug}.md`

### Naming Rules for Plan File:
1. Extract 2-3 key words from request
2. Lowercase, hyphen-separated
3. Max 30 characters
4. Example: "e-commerce cart" -> PLAN-ecommerce-cart.md

## Expected Output

| Deliverable | Location |
|-------------|----------|
| Project Plan | `docs/PLAN-{task-slug}.md` |
| Task Breakdown | Inside plan file |
| Agent Assignments | Inside plan file |
| Verification Checklist | Inside plan file |

## After Planning

Tell user:
```
[OK] Plan created: docs/PLAN-{slug}.md

Next steps:
- Review the plan
- Run /create to start implementation
- Or modify plan manually
```

Create plan for: $ARGUMENTS
