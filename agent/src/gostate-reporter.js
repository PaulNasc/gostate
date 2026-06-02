/**
 * goState Custom Playwright Reporter
 * 
 * Writes step-level events to a JSONL file that the agent watches in real-time.
 * Each line is a JSON object with: { event, stepIndex, name, status, duration, error, timestamp }
 * 
 * Also handles per-step screenshots when GOSTATE_STEP_SCREENSHOTS=1.
 */
const fs = require('fs');
const path = require('path');

class GoStateReporter {
  constructor(options = {}) {
    this.eventsFile = options.eventsFile || process.env.GOSTATE_EVENTS_FILE || '';
    this.stepScreenshots = process.env.GOSTATE_STEP_SCREENSHOTS === '1';
    this.outputDir = process.env.GOSTATE_OUTPUT_DIR || '';
    this.stepIndex = 0;
    this.fd = null;
  }

  _write(obj) {
    if (!this.fd && this.eventsFile) {
      try {
        this.fd = fs.openSync(this.eventsFile, 'a');
      } catch { return; }
    }
    if (this.fd) {
      try {
        fs.writeSync(this.fd, JSON.stringify(obj) + '\n');
      } catch {}
    }
  }

  onBegin(config, suite) {
    this._write({ event: 'begin', timestamp: Date.now(), totalTests: suite.allTests().length });
  }

  onTestBegin(test) {
    this._write({ event: 'testBegin', timestamp: Date.now(), title: test.title, testId: test.id });
  }

  onStepBegin(test, result, step) {
    // Only report user-level steps (actions), skip internal hooks
    if (step.category !== 'test.step' && step.category !== 'expect' && !step.title.startsWith('page.') && !step.title.startsWith('locator.') && !step.title.startsWith('expect')) {
      return;
    }
    const idx = this.stepIndex++;
    step._gostate_index = idx;
    this._write({
      event: 'stepBegin',
      stepIndex: idx,
      name: step.title,
      category: step.category,
      timestamp: Date.now(),
    });
  }

  onStepEnd(test, result, step) {
    if (step._gostate_index === undefined) return;
    const duration = step.duration || 0;
    const error = step.error ? (step.error.message || String(step.error)) : null;
    const status = error ? 'failed' : 'passed';

    this._write({
      event: 'stepEnd',
      stepIndex: step._gostate_index,
      name: step.title,
      status,
      duration,
      error,
      timestamp: Date.now(),
    });
  }

  onTestEnd(test, result) {
    // Collect attachment info for screenshots produced by the test
    const attachments = (result.attachments || []).map(a => ({
      name: a.name,
      contentType: a.contentType,
      path: a.path || null,
    }));

    this._write({
      event: 'testEnd',
      timestamp: Date.now(),
      title: test.title,
      status: result.status,
      duration: result.duration,
      attachments,
    });
  }

  onEnd(result) {
    this._write({ event: 'end', timestamp: Date.now(), status: result.status });
    if (this.fd) {
      try { fs.closeSync(this.fd); } catch {}
      this.fd = null;
    }
  }
}

module.exports = GoStateReporter;
