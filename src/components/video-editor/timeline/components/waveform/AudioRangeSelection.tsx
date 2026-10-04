import { createContext, useContext } from "react";
import type { AudioRangeSelection } from "../../../audio/audioRegionEdit";
import { formatPlayheadTime } from "../../core/time";

export interface AudioRangeTarget {
	kind: AudioRangeSelection["kind"];
	targetId: string;
}

/** Shares the Shift+drag range selection with timeline items without prop drilling. */
export const AudioRangeContext = createContext<{
	selection: AudioRangeSelection | null;
	setSelection?: (selection: AudioRangeSelection | null) => void;
}>({ selection: null });

export function useAudioRange() {
	return useContext(AudioRangeContext);
}

/**
 * Start a Shift+drag range selection on an audio item. Returns true when it
 * took over the pointer, so the caller can keep the item from being dragged.
 */
export function beginAudioRangeDrag(params: {
	event: React.PointerEvent<HTMLElement>;
	target: AudioRangeTarget;
	span: { start: number; end: number };
	setSelection: (selection: AudioRangeSelection | null) => void;
}): boolean {
	const { event, target, span, setSelection } = params;
	if (!event.shiftKey || event.button !== 0) return false;
	const element = event.currentTarget;
	const rect = element.getBoundingClientRect();
	if (rect.width <= 0) return false;
	event.stopPropagation();
	event.preventDefault();

	const toMs = (clientX: number) => {
		const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return Math.round(span.start + ratio * (span.end - span.start));
	};
	const anchorMs = toMs(event.clientX);
	const update = (clientX: number) => {
		const currentMs = toMs(clientX);
		setSelection({
			...target,
			startMs: Math.min(anchorMs, currentMs),
			endMs: Math.max(anchorMs, currentMs),
		});
	};
	update(event.clientX);
	const onMove = (moveEvent: PointerEvent) => update(moveEvent.clientX);
	const onUp = (upEvent: PointerEvent) => {
		update(upEvent.clientX);
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
	};
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	return true;
}

/** Highlight for the selected range inside an audio item. */
export function AudioRangeHighlight({
	selection,
	span,
}: {
	selection: AudioRangeSelection;
	span: { start: number; end: number };
}) {
	const duration = span.end - span.start;
	if (duration <= 0) return null;
	const left = ((selection.startMs - span.start) / duration) * 100;
	const width = ((selection.endMs - selection.startMs) / duration) * 100;
	return (
		<div
			data-audio-range-selection
			title={`${formatPlayheadTime(selection.startMs)} – ${formatPlayheadTime(selection.endMs)}`}
			className="pointer-events-none absolute inset-y-0 z-[16] border-x-2 border-sky-300 bg-sky-400/40"
			style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }}
		/>
	);
}
