import { Button } from "@/components/ui/button";
import { useScopedT } from "../../../contexts/I18nContext";
import { SliderControl } from "../SliderControl";
import { formatPlayheadTime } from "../timeline/core/time";
import type { AudioRangeSelection } from "./audioRegionEdit";
import type { VolumeEnvelope } from "./volumeEnvelope";

const MAX_FADE_MS = 5000;

/** Fade in/out sliders shared by audio regions and clips. */
export function VolumeShapeControls({
	envelope,
	onChange,
}: {
	envelope: VolumeEnvelope;
	onChange: (patch: VolumeEnvelope) => void;
}) {
	const tSettings = useScopedT("settings");
	return (
		<>
			<SliderControl
				label={tSettings("audio.fadeIn", "Fade in")}
				value={(envelope.fadeInMs ?? 0) / 1000}
				min={0}
				max={MAX_FADE_MS / 1000}
				step={0.1}
				onChange={(seconds) => onChange({ fadeInMs: Math.round(seconds * 1000) })}
				formatValue={(seconds) => `${seconds.toFixed(1)}s`}
			/>
			<SliderControl
				label={tSettings("audio.fadeOut", "Fade out")}
				value={(envelope.fadeOutMs ?? 0) / 1000}
				min={0}
				max={MAX_FADE_MS / 1000}
				step={0.1}
				onChange={(seconds) => onChange({ fadeOutMs: Math.round(seconds * 1000) })}
				formatValue={(seconds) => `${seconds.toFixed(1)}s`}
			/>
		</>
	);
}

/** Actions for a Shift+drag range, or a hint on how to make one. */
export function AudioRangeControls({
	selection,
	onMute,
	onDelete,
}: {
	selection: AudioRangeSelection | null;
	onMute?: () => void;
	onDelete?: () => void;
}) {
	const tSettings = useScopedT("settings");
	if (!selection) {
		return (
			<p className="text-xs text-muted-foreground">
				{tSettings(
					"audio.selectionHint",
					"Hold Shift and drag over an audio track to select a range. M silences it; Delete removes it and closes the gap.",
				)}
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2" data-audio-range-controls>
			<span className="text-xs text-muted-foreground">
				{formatPlayheadTime(selection.startMs)} – {formatPlayheadTime(selection.endMs)} (
				{formatPlayheadTime(selection.endMs - selection.startMs)})
			</span>
			<div className="flex flex-wrap gap-2">
				<Button type="button" size="sm" variant="secondary" onClick={onMute}>
					{tSettings("audio.muteSelection", "Silence selection (M)")}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onDelete}>
					{tSettings("audio.deleteSelection", "Delete selection (Del)")}
				</Button>
			</div>
		</div>
	);
}
