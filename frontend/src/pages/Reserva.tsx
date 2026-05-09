import { Link } from "react-router-dom";
import logo from "../assets/logo.jpg";
import { BookingSection } from "../components/BookingSection";

const TRUST_BADGES = [
  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Reserva garantida" },
  { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", label: "Dados protegidos" },
  { icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z", label: "PIX e cartão" },
  { icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z", label: "Suporte WhatsApp" },
];

export function Reserva() {
  return (
    <div className="min-h-screen bg-[#F7FAEF]" style={{ background: "linear-gradient(160deg, #F7FAEF 0%, #f0ede6 50%, #F7FAEF 100%)" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#8B4F23]/10 shadow-sm">
        <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <img
              src={logo}
              alt="Logo Vagafogo"
              className="h-10 w-10 rounded-full border-2 border-[#8B4F23]/20 object-cover shadow-sm group-hover:border-[#8B4F23]/50 transition-colors"
              loading="eager"
            />
            <div className="hidden xs:block sm:block">
              <p className="font-bold text-[#8B4F23] text-sm leading-none tracking-wide">VAGAFOGO</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mt-0.5">Santuário Natural</p>
            </div>
          </Link>

          {/* Centro: indicador de segurança (desktop) */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Pagamento seguro
          </div>

          {/* Voltar */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#8B4F23]/20 bg-white px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-[#8B4F23] shadow-sm hover:bg-[#8B4F23]/5 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden xs:inline">Voltar ao site</span>
            <span className="xs:hidden">Voltar</span>
          </Link>
        </div>
      </header>

      {/* Banner */}
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-2">
        <div className="flex flex-col items-center text-center gap-1">
          {/* Logo grande no mobile */}
          <div className="flex flex-col items-center gap-3 mb-1">
            <img
              src={logo}
              alt="Vagafogo"
              className="h-16 w-16 rounded-full border-4 border-[#8B4F23]/20 object-cover shadow-md sm:hidden"
              loading="eager"
            />
            <span className="text-xs font-bold uppercase tracking-widest text-[#8B4F23] bg-[#8B4F23]/10 px-3 py-1 rounded-full sm:inline hidden">
              Reservas
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#2D1E0F] leading-tight">
            Reserve sua experiência
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm max-w-md">
            Siga os passos para garantir sua vaga. Pagamento seguro via PIX ou cartão.
          </p>
        </div>

        {/* Trust badges — scroll horizontal no mobile */}
        <div className="mt-4 sm:mt-6 flex items-center gap-4 overflow-x-auto pb-1 justify-start sm:justify-center scrollbar-none">
          {TRUST_BADGES.map((badge, i) => (
            <div key={i} className="flex items-center gap-1.5 shrink-0 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 text-[#8B4F23] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={badge.icon} />
              </svg>
              <span className="whitespace-nowrap">{badge.label}</span>
            </div>
          ))}
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
