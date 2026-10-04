import { type RefObject, useMemo } from "react";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import { retimeCaptionFragment } from "../captionTimeline";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useAudioRangeCommands } from "../hooks/useAudioRangeCommands";
import { useAudioRangeShortcuts } from "../hooks/useAudioRangeShortcuts";
import type { useAudioRegionCommands } from "../hooks/useAudioRegionCommands";
import type { useCaptionCommands } from "../hooks/useCaptionCommands";
import type { useClipRegionCommands } from "../hooks/useClipRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useTimelineState } from "../state/useTimelineState";
import { AudioRangeContext } from "../timeline/components/waveform/AudioRangeSelection";
import TimelineEditor, { type TimelineEditorHandle } from "../timeline/TimelineEditor";

type Props = {
	panelRef?: RefObject<HTMLDivElement | null>;
	timelineRef: RefObject<TimelineEditorHandle | null>;
	timeline: ReturnType<typeof useTimelineState>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	audioCommands: ReturnType<typeof useAudioRegionCommands>;
	rangeCommands: ReturnType<typeof useAudioRangeCommands>;
	captionCommands: ReturnType<typeof useCaptionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	videoPath: string | null;
	videoSourcePath: string | null;
	cursorTelemetrySourcePath: string | null;
	normalizedCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	autoSuggestZoomsTrigger: number;
	handleAutoSuggestZoomsConsumed: () => void;
	disableSuggestedZooms: boolean;
	currentTime: number;
	handleSelectAnnotation: (id: string | null) => void;
};

export function EditorTimelinePanel(props: Props) {
	const {
		timelineRef,
		timeline,
		projection,
		playback,
		audio,
		zoomCommands,
		clipCommands,
		audioCommands,
		rangeCommands,
		captionCommands,
		annotationCommands,
		videoPath,
		videoSourcePath,
		cursorTelemetrySourcePath,
		normalizedCursorTelemetry,
		autoSuggestZoomsTrigger,
		handleAutoSuggestZoomsConsumed,
		disableSuggestedZooms,
		currentTime,
		handleSelectAnnotation,
	} = props;

	useAudioRangeShortcuts({
		hasSelection: timeline.audioRangeSelection !== null,
		onMute: rangeCommands.handleRangeMute,
		onDelete: rangeCommands.handleRangeDelete,
		onClear: rangeCommands.clearRangeSelection,
	});
	const audioRange = useMemo(
		() => ({
			selection: timeline.audioRangeSelection,
			setSelection: timeline.setAudioRangeSelection,
		}),
		[timeline.audioRangeSelection, timeline.setAudioRangeSelection],
	);

	return (
		<div
			ref={props.panelRef}
			tabIndex={-1}
			data-timeline-panel
			className="outline-none flex h-full min-h-0 flex-col bg-transparent px-4 pb-4 pt-1"
		>
			<AudioRangeContext.Provider value={audioRange}>
				<TimelineEditor
					ref={timelineRef}
					videoDuration={projection.timelineDuration}
					currentTime={currentTime}
					playheadTime={projection.timelinePlayheadTime}
					onSeek={playback.handleTimelineSeek}
					videoPath={videoPath}
					videoSourcePath={videoSourcePath}
					cursorTelemetrySourcePath={cursorTelemetrySourcePath}
					cursorTelemetry={normalizedCursorTelemetry}
					autoSuggestZoomsTrigger={autoSuggestZoomsTrigger}
					onAutoSuggestZoomsConsumed={handleAutoSuggestZoomsConsumed}
					disableSuggestedZooms={disableSuggestedZooms}
					zoomRegions={timeline.zoomRegions}
					onZoomAdded={zoomCommands.handleZoomAdded}
					onZoomSuggested={zoomCommands.handleZoomSuggested}
					onZoomSpanChange={zoomCommands.handleZoomSpanChange}
					onZoomDelete={zoomCommands.handleZoomDelete}
					selectedZoomId={timeline.selectedZoomId}
					onSelectZoom={zoomCommands.handleSelectZoom}
					trimRegions={timeline.trimRegions}
					clipRegions={timeline.clipRegions}
					onClipSplit={(splitMs) => {
						if (!audioCommands.handleAudioSplit(splitMs))
							clipCommands.handleClipSplit(splitMs);
					}}
					onClipDelete={clipCommands.handleClipDelete}
					onClipSpanChange={clipCommands.handleClipSpanChange}
					selectedClipId={timeline.selectedClipId}
					onSelectClip={clipCommands.handleSelectClip}
					audioRegions={timeline.audioRegions}
					onAudioAdded={audioCommands.handleAudioAdded}
					onAudioSpanChange={audioCommands.handleAudioSpanChange}
					onAudioDelete={audioCommands.handleAudioDelete}
					selectedAudioId={timeline.selectedAudioId}
					onSelectAudio={audioCommands.handleSelectAudio}
					captionRegions={projection.effectiveCaptionRegions}
					onCaptionSpanChange={(id, span) => {
						const fragment = projection.effectiveCaptionRegions.find(
							(cue) => cue.id === id,
						);
						if (!fragment) return;
						captionCommands.handleCaptionRetime(
							fragment.sourceCueId,
							retimeCaptionFragment(fragment, span),
						);
					}}
					selectedCaptionId={
						projection.effectiveCaptionRegions.find(
							(cue) =>
								cue.sourceCueId === timeline.selectedCaptionId &&
								currentTime * 1000 >= cue.startMs &&
								currentTime * 1000 < cue.endMs,
						)?.id ??
						projection.effectiveCaptionRegions.find(
							(cue) => cue.sourceCueId === timeline.selectedCaptionId,
						)?.id ??
						null
					}
					onSelectCaption={(id) => {
						const fragment = projection.effectiveCaptionRegions.find(
							(cue) => cue.id === id,
						);
						captionCommands.handleSelectCaption(fragment?.sourceCueId ?? null);
						if (fragment) playback.handleTimelineSeek(fragment.startMs / 1000);
					}}
					onCaptionDelete={(id) => {
						const fragment = projection.effectiveCaptionRegions.find(
							(cue) => cue.id === id,
						);
						if (fragment) captionCommands.handleCaptionDelete(fragment.sourceCueId);
					}}
					onCaptionAdded={captionCommands.handleCaptionAdded}
					captionsEnabled={timeline.autoCaptionSettings.enabled}
					captionQuickAddEnabled={timeline.autoCaptionSettings.timelineQuickAdd}
					annotationRegions={timeline.annotationRegions}
					onAnnotationAdded={annotationCommands.handleAnnotationAdded}
					onAnnotationSpanChange={annotationCommands.handleAnnotationSpanChange}
					onAnnotationDelete={annotationCommands.handleAnnotationDelete}
					selectedAnnotationId={timeline.selectedAnnotationId}
					onSelectAnnotation={handleSelectAnnotation}
					showSourceAudioTrack={timeline.clipRegions.some((clip) => clip.showSourceAudio)}
					sourceAudioResourceVersion={timeline.sourceAudioFallbackRefreshKey}
					sourceAudioTrackSettings={audio.activeSourceAudioTrackSettings}
					getSourceAudioTrackSettingsForClip={audio.getSourceAudioTrackSettingsForClip}
					onSourceAudioAvailabilityChange={timeline.setHasClipSourceAudio}
					onSourceAudioTracksMetaChange={audio.onSourceAudioTracksMetaChange}
				/>
			</AudioRangeContext.Provider>
		</div>
	);
}
