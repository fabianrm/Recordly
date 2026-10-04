import { useEffect } from "react";

const IGNORED_TARGETS =
	'[data-recording-library], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

export function isTypingTarget(target: EventTarget | null) {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement &&
			(target.isContentEditable || Boolean(target.closest(IGNORED_TARGETS))))
	);
}

/**
 * While a Shift+drag audio range is selected: M silences it, Delete/Backspace
 * removes it (closing the gap), Escape clears it. Runs in the capture phase so
 * the range wins over deleting the whole selected block.
 */
export function useAudioRangeShortcuts(params: {
	hasSelection: boolean;
	onMute: () => void;
	onDelete: () => void;
	onClear: () => void;
}) {
	const { hasSelection, onMute, onDelete, onClear } = params;
	useEffect(() => {
		if (!hasSelection) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target)) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const key = event.key;
			if (key === "Escape") onClear();
			else if (key === "m" || key === "M") onMute();
			else if (key === "Delete" || key === "Backspace") onDelete();
			else return;
			event.preventDefault();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [hasSelection, onClear, onDelete, onMute]);
}
