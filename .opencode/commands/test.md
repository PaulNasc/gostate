---
description: Test generation and test running command. Creates and executes tests for code.
---

Generate tests, run existing tests, or check test coverage.

User request: $ARGUMENTS

## Sub-commands interpretation

- `coverage` - Show test coverage report
- `watch` - Run tests in watch mode
- `[file/feature]` - Generate tests for specific target
- (empty) - Run all tests

## Generate Tests Behavior

When asked to test a file or feature:

1. **Analyze the code**
   - Identify functions and methods
   - Find edge cases
   - Detect dependencies to mock

2. **Generate test cases**
   - Happy path tests
   - Error cases
   - Edge cases
   - Integration tests (if needed)

3. **Write tests**
   - Use project's test framework (Jest, Vitest, etc.)
   - Follow existing test patterns
   - Mock external dependencies

## Key Principles

- **Test behavior not implementation**
- **One assertion per test** (when practical)
- **Descriptive test names**
- **Arrange-Act-Assert pattern**
- **Mock external dependencies**

Execute test command: $ARGUMENTS
