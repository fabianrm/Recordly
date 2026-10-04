import { describe, expect, it } from "vitest";
import { getZoomLevel, rangeForSelection, rangeForZoomLevel, zoomRangeAround } from "./zoom";

const bounds = { totalMs: 60_000, minVisibleRangeMs: 100 };

describe("zoomRangeAround", () => {
	it("keeps the anchor at the same screen position", () => {
		const next = zoomRangeAround({ start: 0, end: 60_000 }, 0.5, 15_000, bounds);
		expect(next.end - next.start).toBe(30_000);
		// Anchor was at 25% of the view and stays there.
		expect((15_000 - next.start) / (next.end - next.start)).toBeCloseTo(0.25);
	});

	it("centers on an anchor that is off screen", () => {
		const next = zoomRangeAround({ start: 0, end: 10_000 }, 0.5, 40_000, bounds);
		expect(next).toEqual({ start: 37_500, end: 42_500 });
	});

	it("respects the closest zoom and the timeline bounds", () => {
		expect(zoomRangeAround({ start: 0, end: 200 }, 0.01, 100, bounds)).toEqual({
			start: 50,
			end: 150,
		});
		expect(zoomRangeAround({ start: 50_000, end: 60_000 }, 10, 59_000, bounds)).toEqual({
			start: 0,
			end: 60_000,
		});
	});
});

describe("rangeForSelection", () => {
	it("frames the selection with padding", () => {
		expect(rangeForSelection(10_000, 12_000, bounds)).toEqual({ start: 9_800, end: 12_200 });
	});

	it("stays inside the timeline", () => {
		expect(rangeForSelection(0, 1_000, bounds)).toEqual({ start: 0, end: 1_200 });
	});
});

describe("zoom level", () => {
	it("maps the whole timeline to 0 and the closest zoom to 1", () => {
		expect(getZoomLevel({ start: 0, end: 60_000 }, bounds)).toBe(0);
		expect(getZoomLevel({ start: 0, end: 100 }, bounds)).toBeCloseTo(1);
	});

	it("round-trips through rangeForZoomLevel", () => {
		const range = rangeForZoomLevel({ start: 0, end: 60_000 }, 0.5, 30_000, bounds);
		expect(getZoomLevel(range, bounds)).toBeCloseTo(0.5);
		expect((range.start + range.end) / 2).toBeCloseTo(30_000);
	});
});
