import { expect, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

test("timeline panel can be resized and remembers its height", async ({ page }) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	const timeline = page.locator("[data-timeline-panel]");
	await expect(timeline).toBeVisible({ timeout: 20000 });
	const handle = page.locator("[data-panel-resize-handle-id]").first();
	await expect(handle).toBeVisible();

	const before = (await timeline.boundingBox())!.height;
	const handleBox = (await handle.boundingBox())!;
	const x = handleBox.x + handleBox.width / 2;
	const y = handleBox.y + handleBox.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y - 250, { steps: 10 });
	await page.mouse.up();

	await expect
		.poll(async () => (await timeline.boundingBox())!.height)
		.toBeGreaterThan(before + 200);
	const resized = (await timeline.boundingBox())!.height;
	await page.screenshot({
		path: "test-results/editor-resized-timeline.png",
		animations: "disabled",
	});

	await page.reload();
	await expect(timeline).toBeVisible({ timeout: 20000 });
	await expect
		.poll(async () => Math.abs((await timeline.boundingBox())!.height - resized))
		.toBeLessThanOrEqual(2);

	await handle.dblclick();
	await expect
		.poll(async () => Math.abs((await timeline.boundingBox())!.height - before))
		.toBeLessThanOrEqual(2);
});
