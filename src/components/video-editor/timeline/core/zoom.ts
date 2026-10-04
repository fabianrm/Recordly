import type { Range } from "dnd-timeline";

/** Each zoom step (button or key) halves or doubles the visible time. */
export const TIMELINE_ZOOM_STEP = 2;

interface ZoomBounds {
	totalMs: number;
	minVisibleRangeMs: number;
}

function clampSpan(spanMs: number, { totalMs, minVisibleRangeMs }: ZoomBounds) {
	const minSpan = Math.min(Math.max(1, minVisibleRangeMs), totalMs);
	return Math.max(minSpan, Math.min(totalMs, spanMs));
}

function placeSpan(spanMs: number, startMs: number, totalMs: number): Range {
	const start = Math.max(0, Math.min(startMs, totalMs - spanMs));
	return { start, end: start + spanMs };
}

/**
 * Scale the visible span by `factor` (<1 zooms in), keeping `anchorMs` at the
 * same position on screen. If the anchor is off screen, the view centers on it.
 */
export function zoomRangeAround(
	range: Range,
	factor: number,
	anchorMs: number,
	bounds: ZoomBounds,
): Range {
	if (bounds.totalMs <= 0 || !Number.isFinite(factor) || factor <= 0) return range;
	const span = Math.max(1, range.end - range.start);
	const nextSpan = clampSpan(span * factor, bounds);
	const anchor = Math.max(0, Math.min(bounds.totalMs, anchorMs));
	const ratio =
		anchor >= range.start && anchor <= range.end ? (anchor - range.start) / span : 0.5;
	return placeSpan(nextSpan, anchor - ratio * nextSpan, bounds.totalMs);
}

/** View that frames [startMs, endMs] with a little padding on both sides. */
export function rangeForSelection(
	startMs: number,
	endMs: number,
	bounds: ZoomBounds,
	paddingRatio = 0.1,
): Range {
	const selectionSpan = Math.max(1, Math.abs(endMs - startMs));
	const span = clampSpan(selectionSpan * (1 + paddingRatio * 2), bounds);
	const center = (startMs + endMs) / 2;
	return placeSpan(span, center - span / 2, bounds.totalMs);
}

/**
 * Zoom level for the slider: 0 shows the whole timeline, 1 is the closest zoom.
 * Logarithmic, so each step of the slider feels the same.
 */
export function getZoomLevel(range: Range, bounds: ZoomBounds): number {
	const minSpan = Math.min(Math.max(1, bounds.minVisibleRangeMs), bounds.totalMs);
	if (bounds.totalMs <= minSpan) return 0;
	const span = clampSpan(range.end - range.start, bounds);
	return Math.log(bounds.totalMs / span) / Math.log(bounds.totalMs / minSpan);
}

/** Inverse of `getZoomLevel`, anchored like `zoomRangeAround`. */
export function rangeForZoomLevel(
	range: Range,
	level: number,
	anchorMs: number,
	bounds: ZoomBounds,
): Range {
	const minSpan = Math.min(Math.max(1, bounds.minVisibleRangeMs), bounds.totalMs);
	if (bounds.totalMs <= minSpan) return { start: 0, end: bounds.totalMs };
	const clampedLevel = Math.max(0, Math.min(1, level));
	const targetSpan = bounds.totalMs / (bounds.totalMs / minSpan) ** clampedLevel;
	const span = Math.max(1, range.end - range.start);
	return zoomRangeAround(range, targetSpan / span, anchorMs, bounds);
}
