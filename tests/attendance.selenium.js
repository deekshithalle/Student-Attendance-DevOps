// Run the app first with `npm.cmd start`, then run `npm.cmd run test:selenium` in another terminal.

const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");

(async function attendanceSmokeTest() {
  let driver;

  try {
    driver = await new Builder().forBrowser("chrome").build();

    // Open the application
    await driver.get("http://localhost:3000");

    // Wait until the student list is visible
    await driver.wait(
      until.elementLocated(By.css("#attendanceBody tr")),
      10000
    );

    const studentRows = await driver.findElements(
      By.css("#attendanceBody tr")
    );

    assert.ok(
      studentRows.length >= 1,
      "Student list should be visible"
    );

    // Change one attendance mark
    const firstMark = await driver.findElement(
      By.css("#attendanceBody .mark")
    );
    await firstMark.click();

    // Mark all students present
    await driver.findElement(By.id("allPresent")).click();

    // Verify seven period controls per student
    const marks = await driver.findElements(
      By.css("#attendanceBody .mark")
    );

    assert.equal(
      marks.length,
      studentRows.length * 7,
      "Each student must have seven period controls"
    );

    // Capture the save API response
    const saveResponsePromise = driver.wait(async () => {
      const response = await driver.executeScript(
        "return window.__attendanceSaveResponse || null;"
      );
      return response;
    }, 10000);

    // Install a fetch observer before clicking Save
    await driver.executeScript(`
      window.__attendanceSaveResponse = null;

      const originalFetch = window.fetch.bind(window);

      window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        const url = String(args[0]);

        if (url.includes("/api/attendance/bulk")) {
          window.__attendanceSaveResponse = {
            ok: response.ok,
            status: response.status
          };
        }

        return response;
      };
    `);

    await driver.findElement(By.id("saveBtn")).click();

    const saveResponse = await saveResponsePromise;

    assert.equal(
      saveResponse.ok,
      true,
      `Attendance save API failed with HTTP ${saveResponse.status}`
    );

    // Wait for the report refresh that follows a successful save
    await driver.wait(async () => {
      const statusText = await driver
        .findElement(By.id("status"))
        .getText();

      return statusText.toLowerCase().includes("monthly report generated");
    }, 10000);

    console.log("Save API response:", saveResponse);
    console.log(
      "TEST PASSED: student list, seven periods, mark-all and save flow."
    );
  } catch (err) {
    console.error("TEST FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
})();
