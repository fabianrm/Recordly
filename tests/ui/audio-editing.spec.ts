import { expect, type Locator, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

const audioItems = (page: Page) => page.locator('[data-variant="audio"]');
const span = async (item: Locator) => ({
	start: Number(await item.getAttribute("data-start-ms")),
	end: Number(await item.getAttribute("data-end-ms")),
});

async function openEditorWithAudio(page: Page) {
	await installDesktopBridge(page, "filmstrip.mp4");
	await page.goto("/?windowType=editor");
	await expect(page.locator('[data-variant="clip"]')).toHaveCount(1, { timeout: 20000 });
	await page.evaluate(() => {
		window.electronAPI.openAudioFilePicker = async () => ({
			success: true,
			path: `${location.origin}/tests/ui/fixtures/filmstrip.mp4`,
		});
	});
	await page.getByRole("button", { name: "Add Layer", exact: true }).click();
	await page.getByRole("menuitem", { name: "Audio", exact: true }).click();
	await expect(audioItems(page)).toHaveCount(1);
}

/** Shift+drag across an item between two fractions of its width. */
async function selectRange(page: Page, item: Locator, from: number, to: number) {
	const box = (await item.boundingBox())!;
	const y = box.y + box.height / 2;
	await page.keyboard.down("Shift");
	await page.mouse.move(box.x + box.width * from, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * to, y, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.up("Shift");
	await expect(item.locator("[data-audio-range-selection]")).toHaveCount(1);
}

test("Shift+drag selects a range that M silences in place", async ({ page }) => {
	await openEditorWithAudio(page);
	const audio = audioItems(page).first();
	const original = await span(audio);

	await selectRange(page, audio, 0.3, 0.6);
	// Selecting must not move the block.
	expect(await span(audio)).toEqual(original);
	await expect(page.locator("[data-audio-range-controls]")).toBeVisible();

	await page.keyboard.press("m");
	await expect(audioItems(page)).toHaveCount(3);
	const pieces = await Promise.all([0, 1, 2].map((i) => span(audioItems(page).nth(i))));
	expect(pieces[0].start).toBe(original.start);
	expect(pieces[2].end).toBe(original.end);
	expect(pieces[0].end).toBe(pieces[1].start);
	expect(pieces[1].end).toBe(pieces[2].start);
	await expect(audioItems(page).nth(1).locator(".bg-red-900\\/40")).toHaveCount(1);
	await expect(page.locator("[data-audio-range-selection]")).toHaveCount(0);
	await page.screenshot({ path: "test-results/audio-range-muted.png", animations: "disabled" });
});

test("Delete removes the selected range and closes the gap", async ({ page }) => {
	await openEditorWithAudio(page);
	const audio = audioItems(page).first();
	const original = await span(audio);

	await selectRange(page, audio, 0.25, 0.5);
	await page.keyboard.press("Delete");
	await expect(audioItems(page)).toHaveCount(2);
	const [left, right] = await Promise.all([
		span(audioItems(page).nth(0)),
		span(audioItems(page).nth(1)),
	]);
	expect(left.start).toBe(original.start);
	// Closed gap: the right piece starts where the left one ends.
	expect(right.start).toBe(left.end);
	const removed = original.end - right.end;
	expect(removed).toBeGreaterThan((original.end - original.start) * 0.15);
	expect(removed).toBeLessThan((original.end - original.start) * 0.35);
	// The video clip is untouched by edits to added audio.
	await expect(page.locator('[data-variant="clip"]')).toHaveCount(1);
});

test("Escape clears the range; dragging without Shift still moves the block", async ({ page }) => {
	await openEditorWithAudio(page);
	const audio = audioItems(page).first();
	const original = await span(audio);
	await selectRange(page, audio, 0.2, 0.4);
	await page.keyboard.press("Escape");
	await expect(page.locator("[data-audio-range-selection]")).toHaveCount(0);
	await expect(audioItems(page)).toHaveCount(1);

	// The audio fills the whole timeline; delete its tail so there is room to move it.
	await selectRange(page, audio, 0.6, 1);
	await page.keyboard.press("Delete");
	await expect(audioItems(page)).toHaveCount(1);
	const shortened = await span(audio);
	expect(shortened.end).toBeLessThan(original.end);

	const box = (await audio.boundingBox())!;
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width * 0.5, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.5 + 80, y, { steps: 8 });
	await page.mouse.up();
	await expect.poll(async () => (await span(audio)).start).toBeGreaterThan(shortened.start);
	const moved = await span(audio);
	expect(moved.end - moved.start).toBe(shortened.end - shortened.start);
	await expect(audio.locator("[data-audio-range-selection]")).toHaveCount(0);
});
