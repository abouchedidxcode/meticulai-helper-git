import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario, SCENARIOS, SABOTAGE } from '../tools/movecheck.mjs';

for (const k of SCENARIOS) {
  test(`scenario ${k}: every horse obeys the law in every step (hooves within 1 cm)`, () => {
    const { report } = runScenario(k, { secs: 30, n: 16, check: { slide: 0.01 } });
    assert.ok(report.ok, 'failed: ' + report.failed.join(', ') + ' ' + JSON.stringify(report.checks.filter((c) => c.fails).map((c) => c.first)));
    assert.ok(report.info.contacts > 1000, 'hooves were followed');
  });
}
for (const [k, want] of Object.entries(SABOTAGE)) {
  test(`sabotage ${k} is caught by ${want.join(', ')}`, () => {
    const { report } = runScenario('ride', { secs: 6, n: 9, sabotage: k });
    assert.ok(!report.ok, 'the broken law was not noticed');
    for (const w of want) assert.ok(report.failed.includes(w), `${w} did not fire (fired: ${report.failed.join(', ')})`);
  });
}
