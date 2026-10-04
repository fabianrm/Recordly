import type { Range } from "dnd-timeline";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
	BoundingBox,
	MagnifyingGlass,
	MagnifyingGlassMinus,
	MagnifyingGlassPlus,
} from "@/components/ui/icons";
import { useScopedT } from "../../../../../contexts/I18nContext";
import { isTypingTarget } from "../../../hooks/useAudioRangeShortcuts";
import {
	getZoomLevel,
	rangeForSelection,
	rangeForZoomLevel,
	TIMELINE_ZOOM_STEP,
	zoomRangeAround,
} from "../../core/zoom";
import { useAudioRange } from "../waveform/AudioRangeSelection";

interface Props {
	range: Range;
	setRange: (updater: (previous: Range) => Range) => void;
	totalMs: number;
	minVisibleRangeMs: number;
	/** Zoom anchor: the playhead. */
	currentTimeMs: number;
}

/**
 * Timeline zoom: −/+ buttons, a slider, "show all" and "zoom to selection".
 * Keys (outside text fields): = or + zoom in, - zoom out, 0 show all, E zoom to selection.
 */
export function TimelineZoomControls({
	range,
	setRange,
	totalMs,
	minVisibleRangeMs,
	currentTimeMs,
}: Props) {
	const t = useScopedT("settings");
	const { selection } = useAudioRange();
	const bounds = { totalMs, minVisibleRangeMs };
	const level = getZoomLevel(range, bounds);

	const zoomBy = useCallback(
		(factor: number) =>
			setRange((previous) =>
				zoomRangeAround(previous, factor, currentTimeMs, { totalMs, minVisibleRangeMs }),
			),
		[currentTimeMs, minVisibleRangeMs, setRange, totalMs],
	);
	const showAll = useCallback(
		() => setRange(() => ({ start: 0, end: totalMs })),
		[setRange, totalMs],
	);
	const zoomToSelection = useCallback(() => {
		if (!selection) return;
		setRange(() =>
			rangeForSelection(selection.startMs, selection.endMs, { totalMs, minVisibleRangeMs }),
		);
	}, [minVisibleRangeMs, selection, setRange, totalMs]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target)) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const key = event.key;
			if (key === "=" || key === "+") zoomBy(1 / TIMELINE_ZOOM_STEP);
			else if (key === "-" || key === "_") zoomBy(TIMELINE_ZOOM_STEP);
			else if (key === "0") showAll();
			else if ((key === "e" || key === "E") && selection) zoomToSelection();
			else return;
			event.preventDefault();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selection, showAll, zoomBy, zoomToSelection]);

	// Live in the playback toolbar so the timeline keeps all of its height.
	const [slot, setSlot] = useState<Element | null>(null);
	useEffect(() => {
		setSlot(document.querySelector("[data-timeline-zoom-slot]"));
	}, []);

	if (totalMs <= 0) return null;
	const visibleSeconds = (range.end - range.start) / 1000;

	const controls = (
		<div
			className="mr-1 flex shrink-0 items-center gap-0.5 text-muted-foreground"
			data-timeline-zoom-controls
		>
			{selection && (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="size-7 p-0 text-sky-500"
					onClick={zoomToSelection}
					aria-label={t("timelineZoom.toSelection", "Zoom to selection")}
					title={`${t("timelineZoom.toSelection", "Zoom to selection")} (E)`}
				>
					<MagnifyingGlass className="size-4" />
				</Button>
			)}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="size-7 p-0"
				onClick={() => zoomBy(TIMELINE_ZOOM_STEP)}
				disabled={level <= 0}
				aria-label={t("timelineZoom.zoomOut", "Zoom out timeline")}
				title={`${t("timelineZoom.zoomOut", "Zoom out timeline")} (-)`}
			>
				<MagnifyingGlassMinus className="size-4" />
			</Button>
			<input
				type="range"
				min={0}
				max={1000}
				step={1}
				value={Math.round(level * 1000)}
				onChange={(event) => {
					const nextLevel = Number(event.currentTarget.value) / 1000;
					setRange((previous) =>
						rangeForZoomLevel(previous, nextLevel, currentTimeMs, {
							totalMs,
							minVisibleRangeMs,
						}),
					);
				}}
				aria-label={t("timelineZoom.level", "Timeline zoom")}
				title={`${visibleSeconds < 10 ? visibleSeconds.toFixed(2) : Math.round(visibleSeconds)}s`}
				className="hidden h-1 w-24 cursor-pointer lg:block accent-[var(--color-accent,#2563eb)]"
			/>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="size-7 p-0"
				onClick={() => zoomBy(1 / TIMELINE_ZOOM_STEP)}
				disabled={level >= 0.999}
				aria-label={t("timelineZoom.zoomIn", "Zoom in timeline")}
				title={`${t("timelineZoom.zoomIn", "Zoom in timeline")} (+)`}
			>
				<MagnifyingGlassPlus className="size-4" />
			</Button>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="size-7 p-0"
				onClick={showAll}
				disabled={level <= 0}
				aria-label={t("timelineZoom.fit", "Show whole timeline")}
				title={`${t("timelineZoom.fit", "Show whole timeline")} (0)`}
			>
				<BoundingBox className="size-4" />
			</Button>
		</div>
	);
	return slot ? createPortal(controls, slot) : controls;
}
