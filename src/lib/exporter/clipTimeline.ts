import { hasVolumeEnvelope } from "@/components/video-editor/audio/volumeEnvelope";
import { type ClipRegion, getClipSourceStartMs } from "@/components/video-editor/types";

/** Trim-only native paths concatenate source ranges; they cannot place clips. */
/** True when any clip mutes or reshapes its source audio, so the source track must be re-mixed. */
export function hasClipSourceAudioEdits(clips?: ClipRegion[]): boolean {
	return (clips ?? []).some((clip) => Boolean(clip.muted) || hasVolumeEnvelope(clip));
}

export function requiresClipTimelineRendering(clips?: ClipRegion[]): boolean {
	if (!clips) return false;
	return (
		clips.length !== 1 ||
		clips[0].startMs !== 0 ||
		getClipSourceStartMs(clips[0]) !== 0 ||
		clips[0].speed !== 1
	);
}
