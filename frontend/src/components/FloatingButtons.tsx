import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export function FloatingButtons() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisivel(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-6 right-5 z-40 flex flex-col items-end gap-3 transition-all duration-500 ${
        visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none"
      }`}
      aria-label="Ações rápidas"
    >
      {/* WhatsApp */}
      <a
        href="https://wa.me/5562992225471"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3"
        aria-label="Falar no WhatsApp"
      >
        <span className="pointer-events-none opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 bg-[#2D1E0F] text-white text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg">
          Falar no WhatsApp
        </span>
        <div className="w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-xl shadow-[#25D366]/40 hover:scale-110 hover:shadow-[#25D366]/60 transition-all duration-200">
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
          </svg>
        </div>
      </a>

      {/* Reservar */}
      <Link
        to="/reservar"
        className="group flex items-center gap-3"
        aria-label="Fazer reserva"
      >
        <span className="pointer-events-none opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 bg-[#2D1E0F] text-white text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg">
          Fazer reserva
        </span>
        <div className="w-14 h-14 rounded-full bg-[#8B4F23] flex items-center justify-center shadow-xl shadow-[#8B4F23]/40 hover:scale-110 hover:bg-[#A05D2B] hover:shadow-[#8B4F23]/60 transition-all duration-200">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </Link>
    </div>
  );
}
