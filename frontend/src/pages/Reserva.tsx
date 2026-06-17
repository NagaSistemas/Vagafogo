import { Link } from "react-router-dom";
import logo from "../assets/logo.jpg";
import { BookingSection } from "../components/BookingSection";

export function Reserva() {
  return (
    <div className="min-h-screen bg-[#F7FAEF]" style={{ background: "linear-gradient(160deg, #F7FAEF 0%, #f0ede6 50%, #F7FAEF 100%)" }}>

      {/* Botão Voltar flutuante */}
      <div className="absolute top-4 left-4 z-50 sm:top-6 sm:left-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#8B4F23]/20 bg-white/90 backdrop-blur-sm px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-[#8B4F23] shadow-md hover:bg-white hover:shadow-lg transition-all"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Voltar
        </Link>
      </div>

      {/* Intro centralizada */}
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-12 pb-2">
        <div className="flex flex-col items-center text-center gap-3">
          <img
            src={logo}
            alt="Vagafogo"
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-[#8B4F23]/20 object-cover shadow-lg"
            loading="eager"
          />
          <span className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#8B4F23] bg-[#8B4F23]/10 px-4 py-1.5 rounded-full border border-[#8B4F23]/15">
            Reservas
          </span>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#2D1E0F] leading-tight">
            Reserve sua experiência no Vagafogo
          </h1>
        </div>
      </div>

      <BookingSection />

      {/* Footer mínimo */}
      <div className="border-t border-[#8B4F23]/10 mt-8 py-5 text-center px-4">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Santuário Vagafogo · Pirenópolis, GO ·{" "}
          <a href="https://wa.me/5562992225471" target="_blank" rel="noopener noreferrer" className="text-[#8B4F23] hover:underline">
            (62) 99222-5471
          </a>
        </p>
      </div>
    </div>
  );
}
