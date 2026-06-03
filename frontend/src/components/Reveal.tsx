import { type CSSProperties, type ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

type Variant = "up" | "left" | "right" | "scale" | "fade" | "blur";

interface RevealProps {
  children: ReactNode;
  variant?: Variant;
  delay?: number;
  duration?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "span" | "h2" | "h3" | "p";
  /** Anima só uma vez (sem reverse). Default: false */
  once?: boolean;
  /** Threshold do IntersectionObserver. Default: 0.15 */
  threshold?: number;
  style?: CSSProperties;
}

const variantClass: Record<Variant, string> = {
  up: "",
  left: "reveal-left",
  right: "reveal-right",
  scale: "reveal-scale",
  fade: "reveal-fade",
  blur: "reveal-blur",
};

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  duration,
  className = "",
  as: Tag = "div",
  once = false,
  threshold = 0.15,
  style,
}: RevealProps) {
  const { ref, revealed } = useReveal<HTMLElement>({ once, threshold });

  const inlineStyle: CSSProperties = {
    transitionDelay: `${delay}ms`,
    ...(duration ? { transitionDuration: `${duration}ms` } : {}),
    ...style,
  };

  return (
    <Tag
      ref={ref as any}
      className={`reveal ${variantClass[variant]} ${revealed ? "is-visible" : ""} ${className}`}
      style={inlineStyle}
    >
      {children}
    </Tag>
  );
}
