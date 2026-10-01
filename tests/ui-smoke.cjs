// Run against server.py --port 8765. Creates and removes only its own test project.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, "..");
  const resultDir = path.join(root, ".test-results");
  fs.mkdirSync(resultDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1720, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let createdFile;
  try {
    await page.goto(process.env.PLANNER_URL || "http://127.0.0.1:8765");
    await page.waitForSelector("#projectName");
    await page.locator("#new").click();
    await page.locator("#newName").fill("UI smoke test");
    await page.locator("#newStart").fill("2026-10-02");
    await page.locator("#create").click();
    await page.locator("#addPhase").click();
    await page.getByLabel("Task 1 name", { exact: true }).fill("Delivery");
    await page.getByLabel("Task 1 name", { exact: true }).press("Tab");
    await page.locator("#addTask").click();
    await page.getByLabel("Task 2 duration", { exact: true }).fill("3");
    await page.getByLabel("Task 2 duration", { exact: true }).press("Tab");
    await page.locator("#addMilestone").click();
    await page.locator("#details").click();
    await page
      .getByLabel("Task 3 scheduling", { exact: true })
      .selectOption("manual");
    await page.locator('tr[data-id="2"]').click();
    await page.locator('tr[data-id="3"]').click({ modifiers: ["Control"] });
    await page.locator('tr[data-id="3"]').click({ button: "right" });
    await page.locator("#makeDependent").click();
    assert.equal(
      await page.getByLabel("Task 3 start", { exact: true }).inputValue(),
      "2026-10-07",
    );
    await page.getByLabel("Task 2 start", { exact: true }).fill("2026-10-05");
    await page.getByLabel("Task 2 start", { exact: true }).press("Tab");
    assert.equal(
      await page.getByLabel("Task 3 start", { exact: true }).inputValue(),
      "2026-10-10",
    );
    await page.locator('tr[data-id="3"]').click({ button: "right" });
    await page.locator("[data-break-dependency=\"2\"]").click();
    assert.equal(
      await page.getByLabel("Task 3 start", { exact: true }).inputValue(),
      "2026-10-10",
    );
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/save") && r.status() === 200,
    );
    await page.locator("#save").click();
    await page.locator("#confirmSaveAs").click();
    createdFile = (await (await response).json()).filename;
    await page.reload();
    await page.waitForSelector("tr[data-id]");
    assert.equal(await page.locator("tr[data-id]").count(), 3);
    assert.equal(
      await page.locator("#projectName").inputValue(),
      "UI smoke test",
    );
    assert.equal(await page.getByText("Predecessors", { exact: true }).count(), 0);
    await page.locator('[data-collapse="1"]').click();
    assert.equal(await page.locator("tr[data-id]").count(), 1);
    await page.locator('[data-collapse="1"]').click();
    assert.equal(await page.locator("tr[data-id]").count(), 3);
    await page.getByLabel("Task 2 owner", { exact: true }).fill("Workshop");
    await page.getByLabel("Task 2 owner", { exact: true }).press("Tab");
    await page.locator("#undo").click();
    assert.equal(
      await page.getByLabel("Task 2 owner", { exact: true }).inputValue(),
      "",
    );
    await page.locator("#details").click();
    if (process.env.MPP_TEST_FILE) {
      await page.locator("#import").click();
      if (await page.locator("#discard").count())
        await page.locator("#discard").click();
      await page
        .locator("#file")
        .evaluate((e) => (e.dataset.action = "import"));
      await page.locator("#file").setInputFiles(process.env.MPP_TEST_FILE);
      await page
        .getByRole("button", { name: "Review schedule" })
        .waitFor({ timeout: 90000 });
      await page.getByRole("button", { name: "Review schedule" }).click();
      assert.ok((await page.locator("tr[data-id]").count()) > 0);
    }
    await page.screenshot({
      path: path.join(resultDir, "editor.png"),
      fullPage: true,
    });
    await page.locator("#export").click();
    await page.locator("#pdfName").fill("UI smoke export");
    await page.locator("#pdfPaper").selectOption("a3");
    await page.locator("#pdfScale").selectOption("week");
    await page.locator("#makePdf").click();
    await page.getByText("PDF saved.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "UI passed: edit, right-click dependency creation, collapse, undo, details, save/reload, PDF export" +
        (process.env.MPP_TEST_FILE ? ", real MPP import." : "."),
    );
  } finally {
    await browser.close();
    if (createdFile && path.basename(createdFile) === createdFile)
      fs.rmSync(path.join(root, "projects", createdFile), { force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
