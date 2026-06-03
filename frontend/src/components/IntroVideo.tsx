import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "vagafogo-intro-played";

export function IntroVideo() {
  const [ativo, setAtivo] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.sessionStorage.getItem(SESSION_KEY)) return false;
    return true;
  });
  const [saindo, setSaindo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Define src baseado em viewport — desktop x mobile
  const [src] = useState(() => {
    if (typeof window === "undefined") return "/intro-desktop.mp4";
    return window.matchMedia("(max-width: 767px)").matches
      ? "/intro-mobile.mp4"
      : "/intro-desktop.mp4";
  });

  // Bloqueia scroll enquanto a intro está ativa
  useEffect(() => {
    if (!ativo) return;
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAntes;
    };
  }, [ativo]);

  const encerrar = () => {
    if (saindo) return;
    setSaindo(true);
    window.sessionStorage.setItem(SESSION_KEY, "1");
    setTimeout(() => setAtivo(false), 600);
  };

  // Tenta dar play (alguns browsers bloqueiam autoplay sem muted)
  useEffect(() => {
    if (!ativo || !videoRef.current) return;
    const tryPlay = async () => {
      try {
        await videoRef.current?.play();
      } catch {
        // Se autoplay bloqueado, encerra a intro
        encerrar();
      }
    };
    void tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  if (!ativo) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black flex items-center justify-center transition-opacity duration-500 ${
        saindo ? "opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-label="Vídeo de introdução"
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={encerrar}
        onError={encerrar}
        className="h-full w-full object-cover"
      />

      {/* Botão pular */}
      <button
        type="button"
        onClick={encerrar}
        className="absolute bottom-6 right-6 md:bottom-8 md:right-8 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-md border border-white/30 transition-all duration-200 hover:bg-white/25 hover:scale-105"
        aria-label="Pular introdução"
      >
        Pular intro
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>

      {/* Marca Vagafogo flutuante (canto top) */}
      <div className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-2 text-white/85 text-sm font-bold uppercase tracking-[0.3em]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E0B13C] animate-pulse" />
        Vagafogo
      </div>
    </div>
  );
}
