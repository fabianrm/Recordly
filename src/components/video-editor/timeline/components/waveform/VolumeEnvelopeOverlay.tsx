import { getEnvelopePoints, type VolumeEnvelope } from "../../../audio/volumeEnvelope";

interface Props {
	envelope: VolumeEnvelope;
	durationMs: number;
	/** Part of the region currently on screen, in region-local ms. Defaults to all of it. */
	visibleLocalSpan?: { start: number; end: number };
}

/** Read-only volume line (fades) drawn over a waveform. */
export function VolumeEnvelopeOverlay({ envelope, durationMs, visibleLocalSpan }: Props) {
	if (durationMs <= 0) return null;
	const from = visibleLocalSpan?.start ?? 0;
	const to = visibleLocalSpan?.end ?? durationMs;
	if (to <= from) return null;
	// Points off screen still shape the visible segments; the SVG clips them.
	const polyline = getEnvelopePoints(envelope, durationMs)
		.map((point) => `${((point.timeMs - from) / (to - from)) * 100},${(1 - point.gain) * 100}`)
		.join(" ");

	return (
		<div
			className="pointer-events-none absolute inset-x-0 inset-y-[3px] z-[15]"
			data-volume-envelope
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full overflow-hidden"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
			>
				<polyline
					points={polyline}
					fill="none"
					stroke="rgb(250 204 21)"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</div>
	);
}
