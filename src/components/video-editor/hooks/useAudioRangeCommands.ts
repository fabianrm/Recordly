import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import {
	type AudioRangeSelection,
	deleteAudioRange,
	muteAudioRange,
} from "../audio/audioRegionEdit";
import { muteClipRange, removeClipRange } from "../clipRange";
import type { AudioRegion, ClipRegion } from "../types";

interface UseAudioRangeCommandsParams {
	selection: AudioRangeSelection | null;
	setSelection: Dispatch<SetStateAction<AudioRangeSelection | null>>;
	audioRegions: AudioRegion[];
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	clipRegions: ClipRegion[];
	setClipRegions: Dispatch<SetStateAction<ClipRegion[]>>;
	/** Ripple-aware clip replacement (closes gaps and moves dependent regions). */
	applyClipSequence: (clips: ClipRegion[]) => void;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	nextAudioIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
}

/** Audacity-style edits on a Shift+drag selection: silence it, or delete it and close the gap. */
export function useAudioRangeCommands({
	selection,
	setSelection,
	audioRegions,
	setAudioRegions,
	clipRegions,
	setClipRegions,
	applyClipSequence,
	setSelectedAudioId,
	setSelectedClipId,
	nextAudioIdRef,
	nextClipIdRef,
}: UseAudioRangeCommandsParams) {
	const createAudioId = useCallback(() => `audio-${nextAudioIdRef.current++}`, [nextAudioIdRef]);
	const createClipId = useCallback(() => `clip-${nextClipIdRef.current++}`, [nextClipIdRef]);

	const handleRangeMute = useCallback(() => {
		if (!selection) return false;
		const range = { startMs: selection.startMs, endMs: selection.endMs };
		if (selection.kind === "audio") {
			const result = muteAudioRange({
				regions: audioRegions,
				regionId: selection.targetId,
				...range,
				createId: createAudioId,
			});
			if (!result) return false;
			setAudioRegions(result.regions);
			setSelectedAudioId(result.mutedId);
		} else {
			const result = muteClipRange({
				clips: clipRegions,
				clipId: selection.targetId,
				...range,
				createId: createClipId,
			});
			if (!result) return false;
			setClipRegions(result.clips);
			setSelectedClipId(result.mutedId);
		}
		setSelection(null);
		return true;
	}, [
		audioRegions,
		clipRegions,
		createAudioId,
		createClipId,
		selection,
		setAudioRegions,
		setClipRegions,
		setSelectedAudioId,
		setSelectedClipId,
		setSelection,
	]);

	const handleRangeDelete = useCallback(() => {
		if (!selection) return false;
		const range = { startMs: selection.startMs, endMs: selection.endMs };
		if (selection.kind === "audio") {
			const result = deleteAudioRange({
				regions: audioRegions,
				regionId: selection.targetId,
				...range,
				createId: createAudioId,
			});
			if (!result) return false;
			setAudioRegions(result.regions);
			setSelectedAudioId(null);
		} else {
			const next = removeClipRange({
				clips: clipRegions,
				clipId: selection.targetId,
				...range,
				createId: createClipId,
			});
			if (!next || next.length === 0) return false;
			applyClipSequence(next);
			setSelectedClipId(null);
		}
		setSelection(null);
		return true;
	}, [
		applyClipSequence,
		audioRegions,
		clipRegions,
		createAudioId,
		createClipId,
		selection,
		setAudioRegions,
		setSelectedAudioId,
		setSelectedClipId,
		setSelection,
	]);

	const clearRangeSelection = useCallback(() => setSelection(null), [setSelection]);

	return { handleRangeMute, handleRangeDelete, clearRangeSelection };
}
