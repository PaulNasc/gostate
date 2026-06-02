---
description: Comprehensive analysis command. Combines planning, security red-team, multi-agent orchestration, and web testing in a single workflow.
agent: build
---

Run a COMPREHENSIVE ANALYSIS workflow. This combines 4 phases into one unified process.

User request: $ARGUMENTS

## PHASE 1: PLAN

Create a structured analysis plan before any action.

1. Understand the scope: what is being analyzed?
2. Identify attack surfaces and critical paths
3. Define success criteria
4. Create `docs/PLAN-analysis-{slug}.md` with:
   - Scope and objectives
   - Threat model
   - Testing strategy
   - Agent assignments

## PHASE 2: RED-TEAM SECURITY ANALYSIS

Perform adversarial analysis on the target.

1. **Threat modeling**
   - STRIDE analysis (Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation)
   - Identify trust boundaries
   - Map data flow

2. **Vulnerability scanning**
   - Run: `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
   - Check for OWASP Top 10 patterns
   - Look for hardcoded secrets, injection points, auth bypasses

3. **Attack surface mapping**
   - Public endpoints
   - API routes
   - User input vectors
   - Third-party dependencies

4. **Risk prioritization**
   - Critical / High / Medium / Low
   - Exploitation likelihood vs impact

## PHASE 3: MULTI-AGENT ORCHESTRATION

Coordinate specialized agents for comprehensive analysis.

Invoke these agents (minimum 3):

| Agent | Focus |
|-------|-------|
| `security-auditor` | Vulnerability assessment, auth patterns |
| `backend-specialist` | API logic, data flow, error handling |
| `frontend-specialist` | Client-side security, XSS, UI risks |
| `test-engineer` | Test coverage, edge cases |
| `devops-engineer` | Infrastructure, deployment risks |

### Orchestration Rules

- Research before implementation
- Parallel reads, sequential writes
- Synthesize findings — don't just copy-paste agent outputs
- Each agent must provide actionable findings

## PHASE 4: WEB TESTING & VERIFICATION

Validate findings through execution.

1. **Run webapp testing**
   - Run: `python .agent/skills/webapp-testing/scripts/` (if available)
   - Test critical user flows
   - Verify auth flows (login, session, logout)
   - Test input validation

2. **Test generation**
   - Generate tests for identified vulnerabilities
   - Create regression tests for fixes

3. **Verification**
   - Run existing test suite
   - Check build passes
   - Verify no regressions

## OUTPUT FORMAT

```markdown
# Comprehensive Analysis Report

## Executive Summary
[Brief overview of findings and risk level]

## Phase 1: Plan
- Scope: [what was analyzed]
- Plan: `docs/PLAN-analysis-{slug}.md`

## Phase 2: Security Analysis

### Threat Model
| Threat | Likelihood | Impact | Risk |
|--------|-----------|--------|------|
| [threat] | [H/M/L] | [H/M/L] | [H/M/L] |

### Vulnerabilities Found
| # | Type | Severity | Location | Description |
|---|------|----------|----------|-------------|
| 1 | [type] | [Critical/High/Medium/Low] | [file:line] | [desc] |

### Security Scan Results
[Output from security_scan.py]

## Phase 3: Orchestration Findings

### Agents Invoked
| Agent | Key Finding |
|-------|-------------|
| security-auditor | [finding] |
| backend-specialist | [finding] |
| frontend-specialist | [finding] |

## Phase 4: Testing

### Test Results
- Test suite: [N] passed, [N] failed
- New tests generated: [N]
- Coverage: [N]%

### Verified Flows
- [ ] Login flow works
- [ ] Auth tokens handled correctly
- [ ] Input validation active
- [ ] No XSS vectors

## Recommendations

### Critical (fix immediately)
1. [recommendation]
2. [recommendation]

### High (fix this sprint)
1. [recommendation]

### Medium (plan for next release)
1. [recommendation]

### Low (backlog)
1. [recommendation]
```

## CRITICAL RULES

1. Execute ALL 4 phases — do not skip any
2. Run actual security scan scripts, don't just inspect code
3. Minimum 3 agents in orchestration phase
4. Report evidence, not assumptions
5. Prioritize findings by risk, not by order found

Begin comprehensive analysis: $ARGUMENTS
