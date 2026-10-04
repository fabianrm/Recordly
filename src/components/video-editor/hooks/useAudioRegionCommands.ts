import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { changeAudioSpan, planAudioSplit } from "../audio/audioRegionEdit";
import type { VolumeEnvelope } from "../audio/volumeEnvelope";
import type { AudioRegion, EditorEffectSection } from "../types";

interface UseAudioRegionCommandsParams {
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	audioRegions: AudioRegion[];
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	selectedAudioId: string | null;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextAudioIdRef: MutableRefObject<number>;
}

export function useAudioRegionCommands({
	setSelectedClipId,
	audioRegions,
	setAudioRegions,
	selectedAudioId,
	setSelectedAudioId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextAudioIdRef,
}: UseAudioRegionCommandsParams) {
	const handleSelectAudio = useCallback(
		(id: string | null) => {
			setSelectedAudioId(id);
			if (id) {
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedClipId(null);
				setSelectedCaptionId(null);
				setActiveEffectSection("audio");
			}
		},
		[
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedClipId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioAdded = useCallback(
		(span: Span, audioPath: string, trackIndex?: number) => {
			const id = `audio-${nextAudioIdRef.current++}`;
			const newRegion: AudioRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				audioPath,
				volume: 1,
				normalize: false,
				trackIndex,
			};
			setAudioRegions((current) => [...current, newRegion]);
			setSelectedAudioId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedClipId(null);
			setSelectedCaptionId(null);
			setActiveEffectSection("audio");
		},
		[
			nextAudioIdRef,
			setActiveEffectSection,
			setAudioRegions,
			setSelectedAnnotationId,
			setSelectedClipId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...changeAudioSpan(region, span.start, span.end),
								...(normalizedTrackIndex === undefined
									? {}
									: { trackIndex: normalizedTrackIndex }),
							}
						: region,
				),
			);
		},
		[setAudioRegions],
	);

	const handleAudioVolumeChange = useCallback(
		(volume: number) => {
			if (!selectedAudioId || !Number.isFinite(volume)) return;
			const nextVolume = Math.max(0, Math.min(1, volume));
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, volume: nextVolume } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleAudioDelete = useCallback(
		(id: string) => {
			setAudioRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAudioId === id) setSelectedAudioId(null);
		},
		[selectedAudioId, setAudioRegions, setSelectedAudioId],
	);

	const handleAudioNormalizeChange = useCallback(
		(normalize: boolean) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, normalize } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	/** Split the selected audio region at a timeline position. Returns false if nothing was split. */
	const handleAudioSplit = useCallback(
		(splitMs: number) => {
			const region = audioRegions.find((candidate) => candidate.id === selectedAudioId);
			if (!region) return false;
			const plan = planAudioSplit({
				region,
				splitMs,
				createId: () => `audio-${nextAudioIdRef.current++}`,
			});
			if (!plan) return false;
			setAudioRegions((current) =>
				current.flatMap((candidate) =>
					candidate.id === region.id ? [plan.left, plan.right] : [candidate],
				),
			);
			setSelectedAudioId(plan.right.id);
			return true;
		},
		[audioRegions, nextAudioIdRef, selectedAudioId, setAudioRegions, setSelectedAudioId],
	);

	const handleAudioMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) => {
					if (region.id !== selectedAudioId) return region;
					const { muted: _muted, ...rest } = region;
					return muted ? { ...rest, muted: true } : rest;
				}),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleAudioEnvelopeChange = useCallback(
		(patch: VolumeEnvelope) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? applyEnvelopePatch(region, patch) : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	return {
		handleSelectAudio,
		handleAudioSplit,
		handleAudioMutedChange,
		handleAudioEnvelopeChange,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioVolumeChange,
		handleAudioDelete,
		handleAudioNormalizeChange,
	};
}

/** Merge envelope fields, dropping ones that were cleared so saved projects stay minimal. */
export function applyEnvelopePatch<T extends VolumeEnvelope>(target: T, patch: VolumeEnvelope): T {
	const next = { ...target };
	for (const key of ["fadeInMs", "fadeOutMs", "volumeKeyframes"] as const) {
		if (!(key in patch)) continue;
		const value = patch[key];
		const isEmpty =
			value === undefined || (Array.isArray(value) ? value.length === 0 : value <= 0);
		if (isEmpty) delete next[key];
		else (next as VolumeEnvelope)[key] = value as never;
	}
	return next;
}
