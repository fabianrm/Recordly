import { getEnvelopePoints, type VolumeEnvelope } from "../../../audio/volumeEnvelope";

interface Props {
	envelope: VolumeEnvelope;
	durationMs: number;
}

/** Read-only volume line (fades) drawn over a waveform. */
export function VolumeEnvelopeOverlay({ envelope, durationMs }: Props) {
	if (durationMs <= 0) return null;
	const polyline = getEnvelopePoints(envelope, durationMs)
		.map((point) => `${(point.timeMs / durationMs) * 100},${(1 - point.gain) * 100}`)
		.join(" ");

	return (
		<div
			className="pointer-events-none absolute inset-x-0 inset-y-[3px] z-[15]"
			data-volume-envelope
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full overflow-visible"
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
