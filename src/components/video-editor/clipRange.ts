import { MIN_RANGE_EDIT_MS } from "./audio/audioRegionEdit";
import { planClipSplit } from "./clipSplit";
import type { ClipRegion } from "./types";

/**
 * Split `clipId` at the range edges so [startMs, endMs] becomes its own clip.
 * Splitting never moves footage, so the result plays exactly like the input.
 */
function isolateClipRange(params: {
	clips: ClipRegion[];
	clipId: string;
	startMs: number;
	endMs: number;
	createId: () => string;
}): { clips: ClipRegion[]; middleId: string } | null {
	const { clipId, createId } = params;
	const target = params.clips.find((clip) => clip.id === clipId);
	if (!target) return null;
	const start = Math.max(target.startMs, Math.round(Math.min(params.startMs, params.endMs)));
	const end = Math.min(target.endMs, Math.round(Math.max(params.startMs, params.endMs)));
	if (end - start < MIN_RANGE_EDIT_MS) return null;

	let clips = params.clips;
	let middleId = clipId;
	const split = (splitMs: number, keep: "left" | "right") => {
		const plan = planClipSplit({ clipRegions: clips, splitMs, createId });
		if (!plan || plan.targetId !== middleId) return false;
		clips = clips.flatMap((clip) =>
			clip.id === plan.targetId ? [plan.left, plan.right] : [clip],
		);
		middleId = keep === "left" ? plan.left.id : plan.right.id;
		return true;
	};
	if (start > target.startMs && !split(start, "right")) return null;
	if (end < target.endMs && !split(end, "left")) return null;
	return { clips, middleId };
}

/** Silence part of a clip's source audio; the video and timing are untouched. */
export function muteClipRange(params: {
	clips: ClipRegion[];
	clipId: string;
	startMs: number;
	endMs: number;
	createId: () => string;
}): { clips: ClipRegion[]; mutedId: string } | null {
	const isolated = isolateClipRange(params);
	if (!isolated) return null;
	return {
		clips: isolated.clips.map((clip) =>
			clip.id === isolated.middleId ? { ...clip, muted: true } : clip,
		),
		mutedId: isolated.middleId,
	};
}

/**
 * Remove part of a clip (video and its audio). Returns the unpacked sequence;
 * callers pass it through the editor's ripple so later content closes the gap.
 */
export function removeClipRange(params: {
	clips: ClipRegion[];
	clipId: string;
	startMs: number;
	endMs: number;
	createId: () => string;
}): ClipRegion[] | null {
	const isolated = isolateClipRange(params);
	if (!isolated) return null;
	return isolated.clips.filter((clip) => clip.id !== isolated.middleId);
}
