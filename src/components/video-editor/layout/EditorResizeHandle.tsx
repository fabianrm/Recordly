import { PanelResizeHandle } from "react-resizable-panels";

type Props = {
	direction: "horizontal" | "vertical";
	onReset?: () => void;
};

/** Drag handle between editor panels. Double-click restores the default size. */
export function EditorResizeHandle({ direction, onReset }: Props) {
	const isVertical = direction === "vertical";
	return (
		<PanelResizeHandle
			onDoubleClick={onReset}
			className={`group relative z-20 flex shrink-0 items-center justify-center outline-none ${
				isVertical ? "h-2 w-full cursor-row-resize" : "h-full w-2 cursor-col-resize"
			}`}
		>
			<div
				className={`rounded-full bg-foreground/10 transition-colors group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent group-focus-visible:bg-accent ${
					isVertical ? "h-1 w-12" : "h-12 w-1"
				}`}
			/>
		</PanelResizeHandle>
	);
}
