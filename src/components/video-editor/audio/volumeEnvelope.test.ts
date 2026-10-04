import { describe, expect, it, vi } from "vitest";
import {
	evaluateEnvelopeGain,
	getEnvelopePoints,
	scheduleVolumeEnvelope,
	shiftVolumeKeyframes,
	splitVolumeEnvelope,
} from "./volumeEnvelope";

describe("evaluateEnvelopeGain", () => {
	it("is 1 without an envelope", () => {
		expect(evaluateEnvelopeGain(undefined, 500, 1000)).toBe(1);
		expect(evaluateEnvelopeGain({}, 500, 1000)).toBe(1);
	});

	it("interpolates keyframes and holds the ends", () => {
		const envelope = {
			volumeKeyframes: [
				{ timeMs: 1000, gain: 1 },
				{ timeMs: 2000, gain: 0 },
			],
		};
		expect(evaluateEnvelopeGain(envelope, 0, 4000)).toBe(1);
		expect(evaluateEnvelopeGain(envelope, 1500, 4000)).toBeCloseTo(0.5);
		expect(evaluateEnvelopeGain(envelope, 3000, 4000)).toBe(0);
	});

	it("applies fades on top of keyframes", () => {
		const envelope = {
			fadeInMs: 1000,
			fadeOutMs: 500,
			volumeKeyframes: [{ timeMs: 0, gain: 0.5 }],
		};
		expect(evaluateEnvelopeGain(envelope, 0, 4000)).toBe(0);
		expect(evaluateEnvelopeGain(envelope, 500, 4000)).toBeCloseTo(0.25);
		expect(evaluateEnvelopeGain(envelope, 2000, 4000)).toBeCloseTo(0.5);
		expect(evaluateEnvelopeGain(envelope, 3750, 4000)).toBeCloseTo(0.25);
		expect(evaluateEnvelopeGain(envelope, 4000, 4000)).toBe(0);
	});
});

describe("getEnvelopePoints", () => {
	it("covers the whole region and matches the evaluated gain", () => {
		const envelope = { fadeInMs: 200, volumeKeyframes: [{ timeMs: 600, gain: 0.3 }] };
		const points = getEnvelopePoints(envelope, 1000);
		expect(points[0]).toEqual({ timeMs: 0, gain: 0 });
		expect(points[points.length - 1].timeMs).toBe(1000);
		for (const point of points) {
			expect(point.gain).toBeCloseTo(evaluateEnvelopeGain(envelope, point.timeMs, 1000));
		}
	});
});

describe("splitVolumeEnvelope", () => {
	it("keeps the timeline shape on both halves", () => {
		const envelope = {
			fadeInMs: 300,
			fadeOutMs: 300,
			volumeKeyframes: [
				{ timeMs: 0, gain: 1 },
				{ timeMs: 2000, gain: 0 },
			],
		};
		const { left, right } = splitVolumeEnvelope(envelope, 1000, 3000);
		expect(left.fadeInMs).toBe(300);
		expect(left.fadeOutMs).toBeUndefined();
		expect(right.fadeInMs).toBeUndefined();
		expect(right.fadeOutMs).toBe(300);
		for (const timeMs of [0, 500, 999]) {
			expect(
				evaluateEnvelopeGain({ volumeKeyframes: left.volumeKeyframes }, timeMs, 1000),
			).toBeCloseTo(
				evaluateEnvelopeGain({ volumeKeyframes: envelope.volumeKeyframes }, timeMs, 3000),
			);
		}
		for (const timeMs of [1000, 1500, 2500]) {
			expect(
				evaluateEnvelopeGain(
					{ volumeKeyframes: right.volumeKeyframes },
					timeMs - 1000,
					2000,
				),
			).toBeCloseTo(
				evaluateEnvelopeGain({ volumeKeyframes: envelope.volumeKeyframes }, timeMs, 3000),
			);
		}
	});
});

describe("shiftVolumeKeyframes", () => {
	it("keeps keyframes attached to the audio after a left trim", () => {
		const keyframes = [
			{ timeMs: 0, gain: 1 },
			{ timeMs: 1000, gain: 0 },
			{ timeMs: 2000, gain: 1 },
		];
		const shifted = shiftVolumeKeyframes(keyframes, 500)!;
		expect(shifted[0]).toEqual({ timeMs: 0, gain: 0.5 });
		expect(shifted.slice(1)).toEqual([
			{ timeMs: 500, gain: 0 },
			{ timeMs: 1500, gain: 1 },
		]);
	});
});

describe("scheduleVolumeEnvelope", () => {
	it("sets a constant gain when there is no envelope", () => {
		const param = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
		scheduleVolumeEnvelope({
			param: param as unknown as AudioParam,
			envelope: undefined,
			durationMs: 1000,
			baseGain: 0.8,
			contextStartSec: 2,
			fromLocalMs: 0,
			toLocalMs: 1000,
		});
		expect(param.value).toBe(0.8);
		expect(param.setValueAtTime).not.toHaveBeenCalled();
	});

	it("ramps through keyframes within the scheduled window only", () => {
		const param = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
		scheduleVolumeEnvelope({
			param: param as unknown as AudioParam,
			envelope: {
				volumeKeyframes: [
					{ timeMs: 0, gain: 1 },
					{ timeMs: 1000, gain: 0 },
				],
			},
			durationMs: 2000,
			baseGain: 1,
			contextStartSec: 0,
			fromLocalMs: 500,
			toLocalMs: 1500,
		});
		expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
		expect(param.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0, 0.5);
		expect(param.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0, 1);
	});
});
