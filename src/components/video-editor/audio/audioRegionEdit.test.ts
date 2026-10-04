import { describe, expect, it } from "vitest";
import type { AudioRegion } from "../types";
import {
	changeAudioSpan,
	deleteAudioRange,
	muteAudioRange,
	planAudioSplit,
} from "./audioRegionEdit";

const region: AudioRegion = {
	id: "audio-1",
	startMs: 1000,
	endMs: 5000,
	audioPath: "/music.mp3",
	volume: 0.8,
	trackIndex: 0,
	fadeInMs: 500,
	fadeOutMs: 500,
};

describe("planAudioSplit", () => {
	let next = 0;
	const createId = () => `audio-${++next + 10}`;

	it("splits at the playhead and reads the right half further into the file", () => {
		const plan = planAudioSplit({ region, splitMs: 3000, createId })!;
		expect(plan.left).toMatchObject({ startMs: 1000, endMs: 3000, fadeInMs: 500, volume: 0.8 });
		expect(plan.left.fadeOutMs).toBeUndefined();
		expect(plan.left.sourceOffsetMs).toBeUndefined();
		expect(plan.right).toMatchObject({
			startMs: 3000,
			endMs: 5000,
			sourceOffsetMs: 2000,
			fadeOutMs: 500,
		});
		expect(plan.right.fadeInMs).toBeUndefined();
		expect(plan.left.id).not.toBe(plan.right.id);
	});

	it("accumulates an existing offset", () => {
		const plan = planAudioSplit({
			region: { ...region, sourceOffsetMs: 700 },
			splitMs: 2000,
			createId,
		})!;
		expect(plan.left.sourceOffsetMs).toBe(700);
		expect(plan.right.sourceOffsetMs).toBe(1700);
	});

	it("ignores positions outside the region", () => {
		expect(planAudioSplit({ region, splitMs: 1000, createId })).toBeNull();
		expect(planAudioSplit({ region, splitMs: 6000, createId })).toBeNull();
	});
});

describe("changeAudioSpan", () => {
	it("moves without touching the offset", () => {
		const moved = changeAudioSpan({ ...region, sourceOffsetMs: 300 }, 2000, 6000);
		expect(moved).toMatchObject({ startMs: 2000, endMs: 6000, sourceOffsetMs: 300 });
	});

	it("trims the left edge into the file", () => {
		const trimmed = changeAudioSpan(region, 1600, 5000);
		expect(trimmed).toMatchObject({ startMs: 1600, endMs: 5000, sourceOffsetMs: 600 });
	});

	it("cannot extend the left edge before the file start", () => {
		const extended = changeAudioSpan({ ...region, sourceOffsetMs: 200 }, 0, 5000);
		expect(extended.startMs).toBe(800);
		expect(extended.sourceOffsetMs).toBeUndefined();
	});

	it("leaves the offset alone when only the right edge moves", () => {
		expect(changeAudioSpan(region, 1000, 4000)).toMatchObject({ startMs: 1000, endMs: 4000 });
		expect(changeAudioSpan(region, 1000, 4000).sourceOffsetMs).toBeUndefined();
	});
});

describe("muteAudioRange", () => {
	let next = 100;
	const createId = () => `audio-${++next}`;
	const plain: AudioRegion = { id: "a", startMs: 0, endMs: 6000, audioPath: "/m.mp3", volume: 1 };

	it("isolates the range as a muted piece without moving anything", () => {
		const result = muteAudioRange({
			regions: [plain],
			regionId: "a",
			startMs: 2000,
			endMs: 3000,
			createId,
		})!;
		expect(
			result.regions.map(({ startMs, endMs, muted, sourceOffsetMs }) => ({
				startMs,
				endMs,
				muted,
				sourceOffsetMs,
			})),
		).toEqual([
			{ startMs: 0, endMs: 2000, muted: undefined, sourceOffsetMs: undefined },
			{ startMs: 2000, endMs: 3000, muted: true, sourceOffsetMs: 2000 },
			{ startMs: 3000, endMs: 6000, muted: undefined, sourceOffsetMs: 3000 },
		]);
		expect(result.regions[1].id).toBe(result.mutedId);
	});

	it("does not create empty pieces at the region edges", () => {
		const result = muteAudioRange({
			regions: [plain],
			regionId: "a",
			startMs: -500,
			endMs: 1500,
			createId,
		})!;
		expect(result.regions).toHaveLength(2);
		expect(result.regions[0]).toMatchObject({ startMs: 0, endMs: 1500, muted: true });
	});

	it("ignores tiny ranges", () => {
		expect(
			muteAudioRange({ regions: [plain], regionId: "a", startMs: 100, endMs: 110, createId }),
		).toBeNull();
	});
});

describe("deleteAudioRange", () => {
	let next = 200;
	const createId = () => `audio-${++next}`;
	const music: AudioRegion = {
		id: "a",
		startMs: 0,
		endMs: 6000,
		audioPath: "/m.mp3",
		volume: 1,
		trackIndex: 0,
	};
	const later: AudioRegion = { ...music, id: "b", startMs: 7000, endMs: 8000 };
	const otherTrack: AudioRegion = {
		...music,
		id: "c",
		startMs: 7000,
		endMs: 8000,
		trackIndex: 1,
	};

	it("removes the range and closes the gap on the same track only", () => {
		const result = deleteAudioRange({
			regions: [music, later, otherTrack],
			regionId: "a",
			startMs: 2000,
			endMs: 3000,
			createId,
		})!;
		expect(result.removedMs).toBe(1000);
		const byStart = result.regions.map(({ id, startMs, endMs, sourceOffsetMs }) => ({
			id,
			startMs,
			endMs,
			sourceOffsetMs,
		}));
		expect(byStart[0]).toMatchObject({ startMs: 0, endMs: 2000 });
		expect(byStart[1]).toMatchObject({ startMs: 2000, endMs: 5000, sourceOffsetMs: 3000 });
		expect(byStart[2]).toMatchObject({ id: "b", startMs: 6000, endMs: 7000 });
		expect(byStart[3]).toMatchObject({ id: "c", startMs: 7000, endMs: 8000 });
	});

	it("removes the whole region when the range covers it", () => {
		const result = deleteAudioRange({
			regions: [music, later],
			regionId: "a",
			startMs: 0,
			endMs: 6000,
			createId,
		})!;
		expect(result.regions).toEqual([{ ...later, startMs: 1000, endMs: 2000 }]);
	});
});
