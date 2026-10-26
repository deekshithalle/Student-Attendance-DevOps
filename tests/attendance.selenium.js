// Run the app first with `npm start`, then run `npm run test:selenium` in another terminal.
const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");

(async function attendanceSmokeTest() {
  let driver;
  try {
    driver = await new Builder().forBrowser("chrome").build();
    await driver.get("http://localhost:3000");
    await driver.wait(until.elementLocated(By.css("#attendanceBody tr")), 10000);
    const studentRows = await driver.findElements(By.css("#attendanceBody tr"));
    assert.ok(studentRows.length >= 1, "Student list should be visible");

    const firstMark = await driver.findElement(By.css("#attendanceBody .mark"));
    await firstMark.click();
    await driver.findElement(By.id("allPresent")).click();
    const marks = await driver.findElements(By.css("#attendanceBody .mark"));
    assert.equal(marks.length, studentRows.length * 7, "Each student must have seven period controls");

    await driver.findElement(By.id("saveBtn")).click();
    await driver.wait(until.elementTextContains(By.id("status"), "saved"), 10000);
    console.log("TEST PASSED: student list, seven periods, mark-all and save flow.");
  } catch (err) {
    console.error("TEST FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (driver) await driver.quit();
  }
})();
