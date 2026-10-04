import type { AudioRegion } from "../types";
import { shiftVolumeKeyframes, splitVolumeEnvelope } from "./volumeEnvelope";

export function getAudioSourceOffsetMs(region: AudioRegion): number {
	return Number.isFinite(region.sourceOffsetMs) && (region.sourceOffsetMs as number) > 0
		? (region.sourceOffsetMs as number)
		: 0;
}

/**
 * Split an audio region at a timeline position. The right half reads from
 * further into the same file, so playback is unchanged until either half is edited.
 */
export function planAudioSplit(params: {
	region: AudioRegion;
	splitMs: number;
	createId: () => string;
}): { left: AudioRegion; right: AudioRegion } | null {
	const { region, createId } = params;
	if (!Number.isFinite(params.splitMs)) return null;
	const splitAtMs = Math.round(params.splitMs);
	if (splitAtMs <= region.startMs || splitAtMs >= region.endMs) return null;

	const { fadeInMs, fadeOutMs, volumeKeyframes, ...rest } = region;
	const envelope = splitVolumeEnvelope(
		{ fadeInMs, fadeOutMs, volumeKeyframes },
		splitAtMs - region.startMs,
		region.endMs - region.startMs,
	);
	const rightOffsetMs = getAudioSourceOffsetMs(region) + (splitAtMs - region.startMs);
	return {
		left: { ...rest, ...envelope.left, id: createId(), endMs: splitAtMs },
		right: {
			...rest,
			...envelope.right,
			id: createId(),
			startMs: splitAtMs,
			sourceOffsetMs: rightOffsetMs,
		},
	};
}

/**
 * Apply a timeline move/resize. Dragging the left edge trims into the file
 * instead of sliding the audio; it can't reveal audio before the file start.
 */
export function changeAudioSpan(region: AudioRegion, startMs: number, endMs: number): AudioRegion {
	const nextStart = Math.round(startMs);
	const nextEnd = Math.round(endMs);
	const isMove = nextStart - region.startMs === nextEnd - region.endMs;
	if (isMove || nextStart === region.startMs) {
		return { ...region, startMs: nextStart, endMs: nextEnd };
	}

	const offsetMs = getAudioSourceOffsetMs(region);
	const clampedStart = Math.max(nextStart, region.startMs - offsetMs);
	const deltaMs = clampedStart - region.startMs;
	const next: AudioRegion = {
		...region,
		startMs: clampedStart,
		endMs: Math.max(clampedStart + 1, nextEnd),
	};
	const nextOffsetMs = offsetMs + deltaMs;
	if (nextOffsetMs > 0) next.sourceOffsetMs = nextOffsetMs;
	else delete next.sourceOffsetMs;
	if (region.volumeKeyframes) {
		next.volumeKeyframes = shiftVolumeKeyframes(region.volumeKeyframes, deltaMs);
	}
	return next;
}

/** A time range picked with Shift+drag on an added-audio item or a clip's source-audio row. */
export interface AudioRangeSelection {
	kind: "audio" | "source";
	/** Audio region id for "audio", clip id for "source". */
	targetId: string;
	startMs: number;
	endMs: number;
}

/** Shortest range worth editing; anything below is treated as a stray click. */
export const MIN_RANGE_EDIT_MS = 20;

/**
 * Cut `region` into the parts before, inside and after [startMs, endMs].
 * Edges that touch the region's own bounds don't create empty pieces.
 */
function cutAudioRange(
	region: AudioRegion,
	startMs: number,
	endMs: number,
	createId: () => string,
): { before?: AudioRegion; middle: AudioRegion; after?: AudioRegion } | null {
	const start = Math.max(region.startMs, Math.round(Math.min(startMs, endMs)));
	const end = Math.min(region.endMs, Math.round(Math.max(startMs, endMs)));
	if (end - start < MIN_RANGE_EDIT_MS) return null;

	let before: AudioRegion | undefined;
	let rest = region;
	if (start > region.startMs) {
		const split = planAudioSplit({ region: rest, splitMs: start, createId });
		if (!split) return null;
		before = split.left;
		rest = split.right;
	}
	let after: AudioRegion | undefined;
	let middle = rest;
	if (end < rest.endMs) {
		const split = planAudioSplit({ region: rest, splitMs: end, createId });
		if (!split) return null;
		middle = split.left;
		after = split.right;
	}
	return { before, middle, after };
}

/** Silence a time range of one audio region; nothing moves on the timeline. */
export function muteAudioRange(params: {
	regions: AudioRegion[];
	regionId: string;
	startMs: number;
	endMs: number;
	createId: () => string;
}): { regions: AudioRegion[]; mutedId: string } | null {
	const { regions, regionId, startMs, endMs, createId } = params;
	const region = regions.find((candidate) => candidate.id === regionId);
	if (!region) return null;
	const cut = cutAudioRange(region, startMs, endMs, createId);
	if (!cut) return null;
	const middle: AudioRegion = { ...cut.middle, muted: true };
	const pieces = [cut.before, middle, cut.after].filter(Boolean) as AudioRegion[];
	return {
		regions: regions.flatMap((candidate) => (candidate.id === regionId ? pieces : [candidate])),
		mutedId: middle.id,
	};
}

/**
 * Remove a time range of one audio region and close the gap: everything on the
 * same track that starts at or after the range end moves left by its length.
 */
export function deleteAudioRange(params: {
	regions: AudioRegion[];
	regionId: string;
	startMs: number;
	endMs: number;
	createId: () => string;
}): { regions: AudioRegion[]; removedMs: number } | null {
	const { regions, regionId, startMs, endMs, createId } = params;
	const region = regions.find((candidate) => candidate.id === regionId);
	if (!region) return null;
	const cut = cutAudioRange(region, startMs, endMs, createId);
	if (!cut) return null;
	const removedMs = cut.middle.endMs - cut.middle.startMs;
	const rangeEndMs = cut.middle.endMs;
	const track = region.trackIndex ?? 0;
	const shift = (candidate: AudioRegion): AudioRegion => ({
		...candidate,
		startMs: candidate.startMs - removedMs,
		endMs: candidate.endMs - removedMs,
	});
	const next: AudioRegion[] = [];
	for (const candidate of regions) {
		if (candidate.id === regionId) {
			if (cut.before) next.push(cut.before);
			if (cut.after) next.push(shift(cut.after));
		} else if ((candidate.trackIndex ?? 0) === track && candidate.startMs >= rangeEndMs) {
			next.push(shift(candidate));
		} else {
			next.push(candidate);
		}
	}
	return { regions: next, removedMs };
}
