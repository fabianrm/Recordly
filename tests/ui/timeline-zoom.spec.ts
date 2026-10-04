import { expect, type Locator, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const clipWidth = async (page: Page) =>
	(await page.locator('[data-variant="clip"]').first().boundingBox())!.width;

async function openEditor(page: Page) {
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveCount(1, { timeout: 20000 });
	await expect(page.locator("[data-timeline-zoom-controls]")).toBeVisible();
}

test("zoom buttons, slider and keys change how much of the timeline is visible", async ({
	page,
}) => {
	await openEditor(page);
	const controls = page.locator("[data-timeline-zoom-controls]");
	const zoomIn = controls.getByRole("button", { name: "Zoom in timeline", exact: true });
	const zoomOut = controls.getByRole("button", { name: "Zoom out timeline", exact: true });
	const fit = controls.getByRole("button", { name: "Show whole timeline", exact: true });
	const slider = controls.getByRole("slider", { name: "Timeline zoom", exact: true });

	const full = await clipWidth(page);
	await expect(zoomOut).toBeDisabled();
	await expect(fit).toBeDisabled();

	await zoomIn.click();
	await expect.poll(() => clipWidth(page)).toBeGreaterThan(full * 1.8);
	await zoomOut.click();
	await expect.poll(() => clipWidth(page)).toBeLessThan(full * 1.05);

	// Keyboard: = zooms in twice, - zooms out once, 0 shows everything.
	await page.locator('[data-testid="timeline-scroll"]').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press("=");
	await page.keyboard.press("=");
	await expect.poll(() => clipWidth(page)).toBeGreaterThan(full * 3.5);
	await page.keyboard.press("-");
	await expect.poll(() => clipWidth(page)).toBeLessThan(full * 2.5);
	await page.keyboard.press("0");
	await expect.poll(() => clipWidth(page)).toBeLessThan(full * 1.05);

	// Slider at the far right reaches the closest zoom (0.1 s on screen).
	await slider.fill("1000");
	await expect.poll(() => clipWidth(page)).toBeGreaterThan(full * 50);
	await expect(zoomIn).toBeDisabled();
	await fit.click();
	await expect.poll(() => clipWidth(page)).toBeLessThan(full * 1.05);
});

async function selectRange(page: Page, item: Locator, from: number, to: number) {
	const box = (await item.boundingBox())!;
	const y = box.y + box.height / 2;
	await page.keyboard.down("Shift");
	await page.mouse.move(box.x + box.width * from, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * to, y, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.up("Shift");
}

test("zoom to selection frames the Shift+drag range", async ({ page }) => {
	await openEditor(page);
	await page.evaluate(() => {
		window.electronAPI.openAudioFilePicker = async () => ({
			success: true,
			path: `${location.origin}/tests/ui/fixtures/filmstrip.mp4`,
		});
	});
	await page.getByRole("button", { name: "Add Layer", exact: true }).click();
	await page.getByRole("menuitem", { name: "Audio", exact: true }).click();
	const audio = page.locator('[data-variant="audio"]').first();
	await expect(audio).toBeVisible();

	await selectRange(page, audio, 0.4, 0.5);
	const highlight = audio.locator("[data-audio-range-selection]");
	const before = (await highlight.boundingBox())!.width;
	await page.keyboard.press("e");
	// A 10% selection framed with 10% padding fills ~83% of the view.
	await expect
		.poll(async () => (await highlight.boundingBox())!.width)
		.toBeGreaterThan(before * 6);
	const scroll = (await page.locator('[data-testid="timeline-scroll"]').boundingBox())!;
	const framed = (await highlight.boundingBox())!;
	expect(framed.x).toBeGreaterThan(scroll.x);
	expect(framed.x + framed.width).toBeLessThan(scroll.x + scroll.width);
	await page.screenshot({
		path: "test-results/timeline-zoom-selection.png",
		animations: "disabled",
	});

	// The selection survives zooming, so it can still be silenced.
	await page.keyboard.press("m");
	await expect(page.locator('[data-variant="audio"]')).toHaveCount(3);
});
