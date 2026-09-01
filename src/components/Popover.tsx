import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  hint?: string;
  align?: "start" | "end";
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

/** Small anchored panel: closes on Escape and on pointer-down outside. */
export function Popover({
  open,
  onClose,
  title,
  hint,
  align = "start",
  closeLabel,
  children,
  className,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const host = ref.current?.parentElement;
      if (host && !host.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={title} className={`popover popover-${align} ${className ?? ""}`}>
      {title ? (
        <div className="popover-head">
          <div>
            <h3>{title}</h3>
            {hint ? <p>{hint}</p> : null}
          </div>
          <button type="button" className="icon-button ghost" onClick={onClose} aria-label={closeLabel}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
