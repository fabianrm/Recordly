import { describe, expect, it } from "vitest";
import { muteClipRange, removeClipRange } from "./clipRange";
import { getClipSourceStartMs, type ClipRegion } from "./types";

const clips: ClipRegion[] = [
	{ id: "clip-1", startMs: 0, endMs: 6000, speed: 1 },
	{ id: "clip-2", startMs: 6000, endMs: 8000, sourceStartMs: 6000, speed: 1 },
];
let next = 10;
const createId = () => `clip-${++next}`;

describe("muteClipRange", () => {
	it("mutes only the range and keeps footage continuous", () => {
		const result = muteClipRange({
			clips,
			clipId: "clip-1",
			startMs: 2000,
			endMs: 3500,
			createId,
		})!;
		expect(
			result.clips.map((clip) => ({
				startMs: clip.startMs,
				endMs: clip.endMs,
				source: getClipSourceStartMs(clip),
				muted: Boolean(clip.muted),
			})),
		).toEqual([
			{ startMs: 0, endMs: 2000, source: 0, muted: false },
			{ startMs: 2000, endMs: 3500, source: 2000, muted: true },
			{ startMs: 3500, endMs: 6000, source: 3500, muted: false },
			{ startMs: 6000, endMs: 8000, source: 6000, muted: false },
		]);
		expect(result.clips[1].id).toBe(result.mutedId);
	});

	it("splits once when the range touches a clip edge", () => {
		const result = muteClipRange({
			clips,
			clipId: "clip-2",
			startMs: 7000,
			endMs: 9000,
			createId,
		})!;
		expect(result.clips).toHaveLength(3);
		expect(result.clips[2]).toMatchObject({ startMs: 7000, endMs: 8000, muted: true });
	});

	it("ignores ranges that are too short", () => {
		expect(
			muteClipRange({ clips, clipId: "clip-1", startMs: 10, endMs: 15, createId }),
		).toBeNull();
	});
});

describe("removeClipRange", () => {
	it("drops the range and leaves the rest for the ripple to pack", () => {
		const result = removeClipRange({
			clips,
			clipId: "clip-1",
			startMs: 2000,
			endMs: 3000,
			createId,
		})!;
		expect(
			result.map((clip) => [clip.startMs, clip.endMs, getClipSourceStartMs(clip)]),
		).toEqual([
			[0, 2000, 0],
			[3000, 6000, 3000],
			[6000, 8000, 6000],
		]);
	});
});
