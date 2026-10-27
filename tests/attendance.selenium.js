// Run the app with `npm.cmd start` in another terminal.
// Then run: `npm.cmd run test:selenium`

const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASE_URL = "http://localhost:3000";
const evidenceDir = path.join(process.cwd(), "test-evidence");

fs.mkdirSync(evidenceDir, { recursive: true });

async function captureScreenshot(driver, testId) {
  const image = await driver.takeScreenshot();

  fs.writeFileSync(
    path.join(evidenceDir, `${testId}.png`),
    image,
    "base64"
  );
}

async function waitForReportRefresh(driver) {
  await driver.wait(async () => {
    const status = await driver.findElement(By.id("status")).getText();
    return status.toLowerCase().includes("monthly report generated");
  }, 10000);
}

async function getMonthlyReportRows(driver) {
  const tables = await driver.findElements(By.css("table"));

  for (const table of tables) {
    const headers = await table.findElements(By.css("thead th"));
    const headerText = (
      await Promise.all(headers.map((header) => header.getText()))
    ).join(" ").toLowerCase();

    if (headerText.includes("working periods")) {
      return table.findElements(By.css("tbody tr"));
    }
  }

  throw new Error("Monthly report table was not found");
}

(async function attendanceSmokeTest() {
  let driver;
  let failures = 0;

  async function runCase(testId, description, test) {
    try {
      await test();
      await captureScreenshot(driver, testId);
      console.log(`PASS ${testId}: ${description}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${testId}: ${description}`);
      console.error(error.message);

      if (driver) {
        try {
          await captureScreenshot(driver, `${testId}-FAIL`);
        } catch (_) {
          // Preserve the original test failure.
        }
      }
    }
  }

  try {
    driver = await new Builder().forBrowser("chrome").build();
    await driver.get(BASE_URL);

    await driver.wait(
      until.elementLocated(By.css("#attendanceBody tr")),
      10000
    );

    // TC-01: Student list visibility
    await runCase("TC-01", "Student list visibility", async () => {
      const rows = await driver.findElements(
        By.css("#attendanceBody tr")
      );
      assert.ok(rows.length > 0, "No student rows were found");
    });

    // TC-02: Seven attendance controls per student
    await runCase("TC-02", "Seven-period attendance controls", async () => {
      const rows = await driver.findElements(
        By.css("#attendanceBody tr")
      );
      const marks = await driver.findElements(
        By.css("#attendanceBody .mark")
      );

      assert.equal(
        marks.length,
        rows.length * 7,
        "Expected seven attendance controls per student"
      );
    });

    // TC-03: Mark-all interaction
    await runCase("TC-03", "Mark-all attendance interaction", async () => {
      await driver.findElement(By.id("allPresent")).click();

      const marks = await driver.findElements(
        By.css("#attendanceBody .mark")
      );

      for (const mark of marks) {
        assert.equal(
          (await mark.getText()).trim(),
          "P",
          "A period was not marked present"
        );
      }
    });

    // TC-04: Save attendance for the selected date
    await runCase("TC-04", "Save attendance", async () => {
      await driver.executeScript(`
        window.__attendanceSaveResponse = null;
        const originalFetch = window.fetch.bind(window);

        window.fetch = async (...args) => {
          const response = await originalFetch(...args);

          if (String(args[0]).includes("/api/attendance/bulk")) {
            window.__attendanceSaveResponse = {
              ok: response.ok,
              status: response.status
            };
          }

          return response;
        };
      `);

      await driver.findElement(By.id("saveBtn")).click();

      await driver.wait(async () => {
        return await driver.executeScript(
          "return window.__attendanceSaveResponse"
        );
      }, 10000);

      const response = await driver.executeScript(
        "return window.__attendanceSaveResponse"
      );

      assert.equal(response.ok, true, `Save returned HTTP ${response.status}`);
      assert.equal(response.status, 200);

      await waitForReportRefresh(driver);
    });

    // TC-05: Monthly report refresh after save
    await runCase("TC-05", "Monthly report refresh", async () => {
      await waitForReportRefresh(driver);

      const reportRows = await getMonthlyReportRows(driver);
      assert.ok(reportRows.length > 0, "Monthly report has no rows");
    });

    // TC-06: Add-student required-field validation
    await runCase("TC-06", "Required-field validation", async () => {
      const roll = await driver.findElement(
        By.css('input[placeholder="e.g. 106"]')
      );
      const name = await driver.findElement(
        By.css('input[placeholder="Full name"]')
      );

      await roll.clear();
      await name.clear();

      assert.notEqual(
        await roll.getAttribute("required"),
        null,
        "Roll number field is not required"
      );

      assert.notEqual(
        await name.getAttribute("required"),
        null,
        "Student name field is not required"
      );

      const validity = await driver.executeScript(() => {
        const inputs = [...document.querySelectorAll("input")];
        const rollInput = inputs.find(
          (input) => input.placeholder === "e.g. 106"
        );
        const nameInput = inputs.find(
          (input) => input.placeholder === "Full name"
        );

        return {
          rollInvalid: rollInput ? !rollInput.checkValidity() : false,
          nameInvalid: nameInput ? !nameInput.checkValidity() : false
        };
      });

      assert.equal(validity.rollInvalid, true);
      assert.equal(validity.nameInvalid, true);
    });

    // TC-07: Repeated-save consistency
    await runCase("TC-07", "Repeated-save consistency", async () => {
      const saveButton = await driver.findElement(By.id("saveBtn"));

      await saveButton.click();
      await waitForReportRefresh(driver);

      await saveButton.click();
      await waitForReportRefresh(driver);

      const rows = await getMonthlyReportRows(driver);
      assert.ok(rows.length > 0, "Monthly report has no rows");

      for (const row of rows) {
        const cells = await row.findElements(By.css("td"));
        const values = await Promise.all(
          cells.map((cell) => cell.getText())
        );

        // Report columns: Roll No., Student, Working periods,
        // Present, Absent, Attendance, Status.
        const workingPeriods = Number(values[2]);

        assert.equal(
          workingPeriods,
          21,
          `Expected 21 periods after repeated saves; got ${workingPeriods}`
        );
      }
    });

    // TC-08: Monthly totals and percentage
    await runCase("TC-08", "Monthly totals and percentage", async () => {
      const rows = await getMonthlyReportRows(driver);
      assert.ok(rows.length > 0);

      for (const row of rows) {
        const cells = await row.findElements(By.css("td"));
        const values = await Promise.all(
          cells.map((cell) => cell.getText())
        );

        assert.equal(Number(values[2]), 21, "Incorrect working periods");
        assert.equal(Number(values[3]), 21, "Incorrect present count");
        assert.equal(Number(values[4]), 0, "Incorrect absent count");
        assert.match(values[5], /100(\.00)?%/, "Incorrect percentage");
      }
    });
// TC-09: Monthly report generation and CSV export
await runCase(
  "TC-09",
  "Monthly report generation and CSV export",
  async () => {
    // Generate the monthly report
    await driver.findElement(By.id("reportBtn")).click();
    await waitForReportRefresh(driver);

    // Verify the CSV export link exists
    const csvLink = await driver.findElement(By.id("csvLink"));

    assert.equal(
      (await csvLink.getText()).trim(),
      "Export CSV",
      "CSV export link text is incorrect"
    );

    const href = await csvLink.getAttribute("href");

    assert.ok(
      href && href !== "#" && !href.endsWith("#"),
      "CSV export link does not have a valid download URL"
    );

    // Capture the successful report and export-link state
    assert.ok(
      await csvLink.isDisplayed(),
      "CSV export link is not visible"
    );
  }
);


    // TC-10: Saved attendance survives a page reload
    await runCase("TC-10", "Attendance persists after page reload", async () => {
      await driver.navigate().refresh();

      await driver.wait(
        until.elementLocated(By.css("#attendanceBody tr")),
        10000
      );

      await driver.wait(async () => {
        const marks = await driver.findElements(
          By.css("#attendanceBody .mark")
        );

        if (marks.length === 0) return false;

        const values = await Promise.all(
          marks.map((mark) => mark.getText())
        );

        return values.every((value) => value.trim() === "P");
      }, 10000);
    });

    console.log(`\nScreenshots: ${evidenceDir}`);
    console.log(`Failed test cases: ${failures}`);

    if (failures > 0) {
      process.exitCode = 1;
    } else {
      console.log("All Selenium UI test cases passed.");
    }
  } catch (error) {
    console.error("Selenium setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (driver) await driver.quit();
  }
})();