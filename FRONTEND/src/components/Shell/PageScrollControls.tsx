import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

type ScrollState = {
  canGoUp: boolean;
  canGoDown: boolean;
};

export default function PageScrollControls({
  containerRef,
  pageKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  pageKey: string;
}) {
  const [state, setState] = useState<ScrollState>({ canGoUp: false, canGoDown: false });

  useEffect(() => {
    let container: HTMLElement | null = null;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const update = () => {
      if (!container) return;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      setState({
        canGoUp: container.scrollTop > 12,
        canGoDown: container.scrollTop < maxScroll - 12,
      });
    };

    const connect = () => {
      container = containerRef.current;
      if (!container) {
        frame = window.requestAnimationFrame(connect);
        return;
      }

      container.scrollTo({ top: 0, behavior: "auto" });
      resizeObserver = new ResizeObserver(update);
      mutationObserver = new MutationObserver(update);
      resizeObserver.observe(container);
      mutationObserver.observe(container, { childList: true, subtree: true });
      container.addEventListener("scroll", update, { passive: true });
      frame = window.requestAnimationFrame(update);
    };

    connect();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      container?.removeEventListener("scroll", update);
    };
  }, [containerRef, pageKey]);

  const move = (direction: -1 | 1) => {
    const container = containerRef.current;
    if (!container) return;
    const distance = Math.max(320, Math.round(container.clientHeight * 0.78));
    container.scrollBy({ top: distance * direction, behavior: "smooth" });
  };

  if (!state.canGoUp && !state.canGoDown) return null;

  return (
    <nav className="page-scroll-controls" aria-label="Rolagem da página">
      {state.canGoUp ? (
        <button type="button" onClick={() => move(-1)} aria-label="Subir a página" title="Subir">
          <ChevronUp size={22} />
        </button>
      ) : null}
      {state.canGoDown ? (
        <button type="button" onClick={() => move(1)} aria-label="Descer a página" title="Descer">
          <ChevronDown size={22} />
        </button>
      ) : null}
    </nav>
  );
}
