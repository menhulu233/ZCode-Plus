import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { X } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { TabsTrigger } from "@/components/ui/tabs.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.js";
import type {
  TerminalSessionCloseSide,
  TerminalSessionDescriptor,
} from "@/terminal/terminalPanelState.js";

export interface TerminalTabTriggerLabels {
  close: string;
  closeTab: string;
  rename: string;
  closeLeft: string;
  closeRight: string;
  closeOthers: string;
}

export function TerminalTabTrigger({
  session,
  title,
  labels,
  isActive,
  canCloseLeft,
  canCloseRight,
  canCloseOthers,
  onClose,
  onCloseSide,
  onCloseOthers,
  onRename,
}: {
  session: TerminalSessionDescriptor;
  title: string;
  labels: TerminalTabTriggerLabels;
  isActive: boolean;
  canCloseLeft: boolean;
  canCloseRight: boolean;
  canCloseOthers: boolean;
  onClose: (sessionId: string) => void;
  onCloseSide: (sessionId: string, side: TerminalSessionCloseSide) => void;
  onCloseOthers: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const blurEnabledRef = useRef(false);
  const blurFrameRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id,
  });

  useEffect(() => {
    // 拖拽开始时必须退出编辑：input 的文本选择手势会拖走整个 tab。
    if (isDragging) {
      setIsEditing(false);
      blurEnabledRef.current = false;
    }
  }, [isDragging]);

  useEffect(
    () => () => {
      if (blurFrameRef.current !== null) {
        window.cancelAnimationFrame(blurFrameRef.current);
      }
    },
    [],
  );

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const startRename = () => {
    blurEnabledRef.current = false;
    setDraftTitle(session.customTitle?.trim() || "");
    setIsEditing(true);
  };

  const cancelRename = () => {
    if (blurFrameRef.current !== null) {
      window.cancelAnimationFrame(blurFrameRef.current);
      blurFrameRef.current = null;
    }
    blurEnabledRef.current = false;
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
    // blur 提交延迟一帧启用：进入编辑的第一帧内（点击穿透引发的瞬时 blur）不视为用户放弃。
    if (blurFrameRef.current !== null) {
      window.cancelAnimationFrame(blurFrameRef.current);
    }
    blurFrameRef.current = window.requestAnimationFrame(() => {
      blurFrameRef.current = null;
      blurEnabledRef.current = true;
    });
  }, [isEditing]);

  const commitRename = () => {
    if (!blurEnabledRef.current) {
      return;
    }
    const value = draftTitle.trim();
    if (value && value !== session.customTitle) {
      onRename(session.id, value);
    }
    cancelRename();
  };

  const handleRenameInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      blurEnabledRef.current = true;
      commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TabsTrigger value={session.id} asChild>
          <div
            ref={setNodeRef}
            data-terminal-tab-id={session.id}
            data-active={isActive ? "" : undefined}
            data-state={isActive ? "active" : "inactive"}
            style={style}
            {...attributes}
            {...listeners}
            onPointerDown={(event) => {
              listeners?.onPointerDown?.(event);
              // dnd 拖拽从 pointerdown 开始接管；TabsTrigger 需要保留点击激活，
              // 阻止默认行为避免与 Radix 的焦点转移在编辑态互相干扰。
              if (!isEditing) {
                event.preventDefault();
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!isEditing) {
                startRename();
              }
            }}
            className={cn(
              "group relative inline-flex !h-7 w-auto max-w-36 min-w-0 flex-none shrink-0 cursor-default items-center justify-start gap-1 overflow-hidden whitespace-nowrap rounded-lg border !border-transparent !bg-transparent pl-2 pr-1 text-ui-base font-medium text-foreground-subtle transition-all",
              "hover:text-foreground",
              !isActive && "hover:!bg-hover",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
              "data-active:!bg-selected data-active:text-foreground",
            )}
          >
            <span
              data-terminal-tab-content=""
              className={cn(
                "flex min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-0.5rem),transparent)]",
                isEditing && "invisible",
              )}
            >
              <span className="shrink-0 whitespace-nowrap">{title}</span>
            </span>
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={draftTitle}
                aria-label={labels.rename}
                spellCheck={false}
                className="absolute inset-0 z-10 rounded-md bg-input px-2 text-ui-base text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onChange={(event) => {
                  setDraftTitle(event.currentTarget.value);
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onBlur={commitRename}
                onKeyDown={handleRenameInputKeyDown}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={labels.closeTab}
                className={cn(
                  "shrink-0 rounded-md",
                  !isActive &&
                    "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                )}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(session.id);
                }}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={startRename}>{labels.rename}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onClose(session.id)}>{labels.close}</ContextMenuItem>
        <ContextMenuItem disabled={!canCloseLeft} onSelect={() => onCloseSide(session.id, "left")}>
          {labels.closeLeft}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canCloseRight}
          onSelect={() => onCloseSide(session.id, "right")}
        >
          {labels.closeRight}
        </ContextMenuItem>
        <ContextMenuItem disabled={!canCloseOthers} onSelect={() => onCloseOthers(session.id)}>
          {labels.closeOthers}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
