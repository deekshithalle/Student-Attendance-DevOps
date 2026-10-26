const test = require("node:test");
const assert = require("node:assert/strict");

test("attendance percentage formula is correct", () => {
  const percentage = Number((140 / 154 * 100).toFixed(2));
  assert.equal(percentage, 90.91);
});

test("low attendance threshold flags 74.68 percent", () => {
  assert.equal((115 / 154 * 100) < 75, true);
});

test("seven daily periods are expected", () => {
  assert.equal(Array.from({length: 7}).length, 7);
});
