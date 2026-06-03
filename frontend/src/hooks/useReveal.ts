import { useEffect, useRef, useState } from "react";

type UseRevealOptions = IntersectionObserverInit & {
  once?: boolean;
};

/**
 * Observa um elemento e marca como `revealed` quando entra no viewport.
 * Se `once: false` (default), volta a `false` ao sair — permite re-animar no scroll reverso.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {}
) {
  const { once = false, threshold = 0.15, rootMargin = "0px 0px -80px 0px" } = options;
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) observer.disconnect();
          } else if (!once) {
            // Re-esconde para animar de novo ao voltar
            setRevealed(false);
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return { ref, revealed };
}
