/** A volume point inside a region. `timeMs` is relative to the region start on the timeline. */
export interface VolumeKeyframe {
	timeMs: number;
	/** Multiplier applied on top of the region volume, 0..1. */
	gain: number;
}

/** Volume shape shared by audio regions and clip source audio. All fields are optional. */
export interface VolumeEnvelope {
	fadeInMs?: number;
	fadeOutMs?: number;
	volumeKeyframes?: VolumeKeyframe[];
}

export interface EnvelopePoint {
	timeMs: number;
	gain: number;
}

const FADE_SAMPLE_STEP_MS = 50;

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value));
}

function safeFadeMs(value: number | undefined, durationMs: number) {
	return Number.isFinite(value) && (value as number) > 0
		? Math.min(value as number, durationMs)
		: 0;
}

export function hasVolumeEnvelope(envelope: VolumeEnvelope | undefined): boolean {
	return Boolean(
		envelope &&
			((envelope.fadeInMs ?? 0) > 0 ||
				(envelope.fadeOutMs ?? 0) > 0 ||
				(envelope.volumeKeyframes?.length ?? 0) > 0),
	);
}

export function sortVolumeKeyframes(keyframes: VolumeKeyframe[] | undefined): VolumeKeyframe[] {
	return (keyframes ?? [])
		.filter((keyframe) => Number.isFinite(keyframe.timeMs) && Number.isFinite(keyframe.gain))
		.map((keyframe) => ({
			timeMs: Math.max(0, Math.round(keyframe.timeMs)),
			gain: clamp01(keyframe.gain),
		}))
		.sort((left, right) => left.timeMs - right.timeMs);
}

/** Gain from the keyframes alone (linear between points, held flat outside them). */
export function evaluateKeyframeGain(keyframes: VolumeKeyframe[] | undefined, localMs: number) {
	const sorted = sortVolumeKeyframes(keyframes);
	if (sorted.length === 0) return 1;
	if (localMs <= sorted[0].timeMs) return sorted[0].gain;
	const last = sorted[sorted.length - 1];
	if (localMs >= last.timeMs) return last.gain;
	for (let index = 1; index < sorted.length; index++) {
		const next = sorted[index];
		if (localMs <= next.timeMs) {
			const previous = sorted[index - 1];
			const span = next.timeMs - previous.timeMs;
			if (span <= 0) return next.gain;
			const progress = (localMs - previous.timeMs) / span;
			return previous.gain + (next.gain - previous.gain) * progress;
		}
	}
	return last.gain;
}

function evaluateFadeGain(envelope: VolumeEnvelope, localMs: number, durationMs: number) {
	const fadeInMs = safeFadeMs(envelope.fadeInMs, durationMs);
	const fadeOutMs = safeFadeMs(envelope.fadeOutMs, durationMs);
	let gain = 1;
	if (fadeInMs > 0 && localMs < fadeInMs) gain *= clamp01(localMs / fadeInMs);
	if (fadeOutMs > 0 && localMs > durationMs - fadeOutMs) {
		gain *= clamp01((durationMs - localMs) / fadeOutMs);
	}
	return gain;
}

/** Envelope multiplier (0..1) at `localMs` within a region lasting `durationMs`. */
export function evaluateEnvelopeGain(
	envelope: VolumeEnvelope | undefined,
	localMs: number,
	durationMs: number,
): number {
	if (!envelope) return 1;
	return (
		evaluateKeyframeGain(envelope.volumeKeyframes, localMs) *
		evaluateFadeGain(envelope, localMs, durationMs)
	);
}

/**
 * Points that, joined by straight lines, reproduce the envelope over the
 * whole region. Fades are sampled because fade × keyframe ramps is not linear.
 */
export function getEnvelopePoints(
	envelope: VolumeEnvelope | undefined,
	durationMs: number,
): EnvelopePoint[] {
	const safeDuration = Math.max(0, durationMs);
	const times = new Set<number>([0, safeDuration]);
	if (envelope) {
		for (const keyframe of sortVolumeKeyframes(envelope.volumeKeyframes)) {
			if (keyframe.timeMs < safeDuration) times.add(keyframe.timeMs);
		}
		const fadeInMs = safeFadeMs(envelope.fadeInMs, safeDuration);
		const fadeOutMs = safeFadeMs(envelope.fadeOutMs, safeDuration);
		for (let time = 0; time < fadeInMs; time += FADE_SAMPLE_STEP_MS) times.add(time);
		if (fadeInMs > 0) times.add(fadeInMs);
		for (let time = safeDuration - fadeOutMs; time < safeDuration; time += FADE_SAMPLE_STEP_MS)
			times.add(time);
	}
	return [...times]
		.sort((left, right) => left - right)
		.map((timeMs) => ({ timeMs, gain: evaluateEnvelopeGain(envelope, timeMs, safeDuration) }));
}

/**
 * Schedule the envelope on a Web Audio gain param for the part of the region
 * between `fromLocalMs` and `toLocalMs`, which plays starting at `contextStartSec`.
 */
export function scheduleVolumeEnvelope(params: {
	param: AudioParam;
	envelope: VolumeEnvelope | undefined;
	durationMs: number;
	baseGain: number;
	contextStartSec: number;
	fromLocalMs: number;
	toLocalMs: number;
}): void {
	const { param, envelope, durationMs, baseGain, contextStartSec, fromLocalMs, toLocalMs } =
		params;
	if (!hasVolumeEnvelope(envelope)) {
		param.value = baseGain;
		return;
	}
	const toContextTime = (localMs: number) =>
		Math.max(0, contextStartSec + (localMs - fromLocalMs) / 1000);
	param.setValueAtTime(
		baseGain * evaluateEnvelopeGain(envelope, fromLocalMs, durationMs),
		toContextTime(fromLocalMs),
	);
	for (const point of getEnvelopePoints(envelope, durationMs)) {
		if (point.timeMs <= fromLocalMs) continue;
		if (point.timeMs >= toLocalMs) {
			param.linearRampToValueAtTime(
				baseGain * evaluateEnvelopeGain(envelope, toLocalMs, durationMs),
				toContextTime(toLocalMs),
			);
			return;
		}
		param.linearRampToValueAtTime(baseGain * point.gain, toContextTime(point.timeMs));
	}
}

function withoutEmpty(envelope: VolumeEnvelope): VolumeEnvelope {
	return {
		fadeInMs: envelope.fadeInMs && envelope.fadeInMs > 0 ? envelope.fadeInMs : undefined,
		fadeOutMs: envelope.fadeOutMs && envelope.fadeOutMs > 0 ? envelope.fadeOutMs : undefined,
		volumeKeyframes:
			envelope.volumeKeyframes && envelope.volumeKeyframes.length > 0
				? envelope.volumeKeyframes
				: undefined,
	};
}

/** Split an envelope at `splitLocalMs`; each half keeps the shape it had on the timeline. */
export function splitVolumeEnvelope(
	envelope: VolumeEnvelope,
	splitLocalMs: number,
	durationMs: number,
): { left: VolumeEnvelope; right: VolumeEnvelope } {
	const keyframes = sortVolumeKeyframes(envelope.volumeKeyframes);
	const boundary =
		keyframes.length > 0 ? { gain: evaluateKeyframeGain(keyframes, splitLocalMs) } : undefined;
	const leftKeyframes = keyframes.filter((keyframe) => keyframe.timeMs < splitLocalMs);
	const rightKeyframes = keyframes
		.filter((keyframe) => keyframe.timeMs > splitLocalMs)
		.map((keyframe) => ({ ...keyframe, timeMs: keyframe.timeMs - splitLocalMs }));
	if (boundary) {
		leftKeyframes.push({ timeMs: splitLocalMs, gain: boundary.gain });
		rightKeyframes.unshift({ timeMs: 0, gain: boundary.gain });
	}
	const rightDuration = Math.max(0, durationMs - splitLocalMs);
	return {
		left: withoutEmpty({
			fadeInMs: Math.min(envelope.fadeInMs ?? 0, splitLocalMs),
			volumeKeyframes: leftKeyframes,
		}),
		right: withoutEmpty({
			fadeOutMs: Math.min(envelope.fadeOutMs ?? 0, rightDuration),
			volumeKeyframes: rightKeyframes,
		}),
	};
}

/**
 * Keep keyframes attached to the audio when the region start moves by
 * `deltaMs` (positive = trimmed in, negative = extended back).
 */
export function shiftVolumeKeyframes(
	keyframes: VolumeKeyframe[] | undefined,
	deltaMs: number,
): VolumeKeyframe[] | undefined {
	const sorted = sortVolumeKeyframes(keyframes);
	if (sorted.length === 0 || deltaMs === 0) return keyframes;
	const startGain = evaluateKeyframeGain(sorted, deltaMs);
	const shifted = sorted
		.map((keyframe) => ({ ...keyframe, timeMs: keyframe.timeMs - deltaMs }))
		.filter((keyframe) => keyframe.timeMs > 0);
	return [{ timeMs: 0, gain: startGain }, ...shifted];
}

/** Sanitize persisted envelope fields. Absent fields stay absent so older projects round-trip unchanged. */
export function normalizeVolumeEnvelope(raw: unknown, durationMs: number): VolumeEnvelope {
	const source = (raw ?? {}) as Record<string, unknown>;
	const result: VolumeEnvelope = {};
	const readFade = (value: unknown) =>
		typeof value === "number" && Number.isFinite(value) && value > 0
			? Math.round(Math.min(value, durationMs))
			: undefined;
	const fadeInMs = readFade(source.fadeInMs);
	const fadeOutMs = readFade(source.fadeOutMs);
	if (fadeInMs) result.fadeInMs = fadeInMs;
	if (fadeOutMs) result.fadeOutMs = fadeOutMs;
	if (Array.isArray(source.volumeKeyframes)) {
		const keyframes = sortVolumeKeyframes(
			source.volumeKeyframes.filter(
				(keyframe): keyframe is VolumeKeyframe =>
					Boolean(keyframe) && typeof keyframe === "object",
			),
		).filter((keyframe) => keyframe.timeMs <= durationMs);
		if (keyframes.length > 0) result.volumeKeyframes = keyframes;
	}
	return result;
}
