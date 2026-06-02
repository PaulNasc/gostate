import { describe, it, expect } from 'vitest';
import { compileGraphToPlaywright } from './dispatch';

describe('Graph Compiler - compileGraphToPlaywright', () => {
  it('should compile a simple sequential webFlow node', () => {
    const graph = {
      nodes: [
        {
          id: 'node-1',
          type: 'webFlow',
          data: {
            label: 'Acesse Home',
            url: 'https://example.com',
            steps: [
              { type: 'click', params: { selector: 'button#login' } },
              { type: 'fill', params: { selector: 'input#email', value: 'user@test.com' } }
            ]
          }
        }
      ],
      edges: []
    };

    const code = compileGraphToPlaywright(graph);

    expect(code).toContain("test('goState Canvas Test'");
    expect(code).toContain('await test.step("Acesse Home"');
    expect(code).toContain('await page.goto("https://example.com")');
    expect(code).toContain('await page.click("button#login")');
    expect(code).toContain('await page.fill("input#email", "user@test.com")');
  });

  it('should compile ifCondition node with true and false branches', () => {
    const graph = {
      nodes: [
        {
          id: 'start',
          type: 'webFlow',
          data: { label: 'Start', url: 'https://example.com' }
        },
        {
          id: 'cond-1',
          type: 'ifCondition',
          data: { label: 'Check Login State', selector: 'div.logged-in' }
        },
        {
          id: 'flow-true',
          type: 'webFlow',
          data: {
            label: 'True Branch',
            steps: [{ type: 'click', params: { selector: 'button#logout' } }]
          }
        },
        {
          id: 'flow-false',
          type: 'webFlow',
          data: {
            label: 'False Branch',
            steps: [{ type: 'click', params: { selector: 'button#login' } }]
          }
        }
      ],
      edges: [
        { source: 'start', target: 'cond-1' },
        { source: 'cond-1', target: 'flow-true', sourceHandle: 'true' },
        { source: 'cond-1', target: 'flow-false', sourceHandle: 'false' }
      ]
    };

    const code = compileGraphToPlaywright(graph);

    expect(code).toContain('await test.step("Check Login State"');
    expect(code).toContain('const condition = await page.locator("div.logged-in").isVisible()');
    expect(code).toContain('if (condition) {');
    expect(code).toContain('await test.step("True Branch"');
    expect(code).toContain('await page.click("button#logout")');
    expect(code).toContain('} else {');
    expect(code).toContain('await test.step("False Branch"');
    expect(code).toContain('await page.click("button#login")');
  });

  it('should compile postgresQuery, httpCall, logNode, and stopAndFail nodes', () => {
    const graph = {
      nodes: [
        {
          id: 'db-1',
          type: 'postgresQuery',
          data: {
            label: 'Query DB',
            connectionString: 'postgresql://db.host:5432/mydb',
            query: 'SELECT status FROM users LIMIT 1',
            variableName: 'myUserStatus'
          }
        },
        {
          id: 'http-1',
          type: 'httpCall',
          data: {
            label: 'Call API',
            method: 'POST',
            url: 'https://api.test/v1/notify',
            body: '{"status": "ok"}',
            variableName: 'apiNotifyResult'
          }
        },
        {
          id: 'log-1',
          type: 'logNode',
          data: {
            label: 'Log Results',
            message: 'All queries completed'
          }
        },
        {
          id: 'stop-1',
          type: 'stopAndFail',
          data: {
            label: 'Fail if needed',
            message: 'Custom Failure Message'
          }
        }
      ],
      edges: [
        { source: 'db-1', target: 'http-1' },
        { source: 'http-1', target: 'log-1' },
        { source: 'log-1', target: 'stop-1' }
      ]
    };

    const code = compileGraphToPlaywright(graph);

    // Postgres Query verification
    expect(code).toContain('await test.step("Query DB"');
    expect(code).toContain("const { Client } = require('pg')");
    expect(code).toContain('connectionString: "postgresql://db.host:5432/mydb"');
    expect(code).toContain('await client.query("SELECT status FROM users LIMIT 1")');
    expect(code).toContain('vars["myUserStatus"] = res.rows');

    // HTTP Call verification
    expect(code).toContain('await test.step("Call API"');
    expect(code).toContain('await page.request.post("https://api.test/v1/notify", { data: {"status": "ok"} })');
    expect(code).toContain('vars["apiNotifyResult"] = { status: res.status(), body: await res.json()');

    // Log Node verification
    expect(code).toContain('await test.step("Log Results"');
    expect(code).toContain('console.log("All queries completed")');

    // Stop and Fail verification
    expect(code).toContain('await test.step("Fail if needed"');
    expect(code).toContain('throw new Error("Custom Failure Message")');
  });

  it('should interpolate environment variables into step parameters', () => {
    const graph = {
      nodes: [
        {
          id: 'node-1',
          type: 'webFlow',
          data: {
            label: 'Environment Flow',
            url: '{{BASE_URL}}/welcome',
            steps: [
              { type: 'fill', params: { selector: 'input#api-key', value: '{{MY_API_KEY}}' } }
            ]
          }
        }
      ],
      edges: []
    };

    const envVars = {
      BASE_URL: 'https://staging.gostate.io',
      MY_API_KEY: 'test-secret-key-123'
    };

    const code = compileGraphToPlaywright(graph, envVars);

    expect(code).toContain('await page.goto("https://staging.gostate.io/welcome")');
    expect(code).toContain('await page.fill("input#api-key", "test-secret-key-123")');
  });

  it('should throw an explicit error when encountering an unsupported node type', () => {
    const graph = {
      nodes: [
        {
          id: 'invalid-node',
          type: 'someCrazyUnsupportedNode',
          data: { label: 'Invalid Node' }
        }
      ],
      edges: []
    };

    expect(() => compileGraphToPlaywright(graph)).toThrow('Unsupported node type: someCrazyUnsupportedNode');
  });
});
