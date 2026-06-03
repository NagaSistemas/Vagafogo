import { useRef, type CSSProperties, type ReactNode } from "react";

interface SpotlightProps {
  children: ReactNode;
  className?: string;
  /** Cor do spotlight em rgba ou hsla. Default: dourado da marca */
  color?: string;
  /** Raio do spotlight em px. Default: 240 */
  size?: number;
  style?: CSSProperties;
}

/**
 * Wrapper que aplica um halo luminoso seguindo o cursor.
 * Só ativa no hover (desktop) — em mobile/touch é estaticamente invisível.
 */
export function Spotlight({
  children,
  className = "",
  color = "rgba(224, 177, 60, 0.18)",
  size = 240,
  style,
}: SpotlightProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      className={`spotlight-wrapper ${className}`}
      onMouseMove={handleMouseMove}
      style={
        {
          ...style,
          "--spot-color": color,
          "--spot-size": `${size}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
