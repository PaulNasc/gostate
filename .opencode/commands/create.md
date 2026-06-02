---
description: Create new application command. Triggers App Builder skill and starts interactive dialogue with user.
---

Start a new application creation process.

User request: $ARGUMENTS

## Steps:

1. **Request Analysis**
   - Understand what the user wants
   - If information is missing, ask clarifying questions

2. **Project Planning**
   - Determine tech stack
   - Plan file structure
   - Create plan file and proceed to building

3. **Application Building (After Approval)**
   - Coordinate expert work:
     - Database schema design
     - Backend API development
     - Frontend UI implementation

4. **Preview**
   - Start development server when complete
   - Present URL to user

## Usage Context

Create a new application based on the user's request: $ARGUMENTS

If the request is unclear, ask:
- What type of application?
- What are the basic features?
- Who will use it?

Use defaults and add details later.
