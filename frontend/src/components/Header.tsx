import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.jpg";

type NavLink = { href: string; label: string; type: "anchor" | "route" };

const NAV_LINKS: NavLink[] = [
  { href: "/#inicio", label: "Início", type: "anchor" },
  { href: "/#brunch", label: "Brunch", type: "anchor" },
  { href: "/#trilha", label: "Trilha", type: "anchor" },
  { href: "/#educacao", label: "Educação", type: "anchor" },
  { href: "/historia", label: "História", type: "route" },
];

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fecharMenu = () => setMenuAberto(false);
  const transparente = !scrolled;

  return (
    <header className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
      transparente
        ? "bg-transparent"
        : "bg-white/95 backdrop-blur-md shadow-md"
    }`}>
      {/* Scrim gradiente — só visível quando transparente */}
      {transparente && (
        <div className="absolute inset-0 header-scrim pointer-events-none" />
      )}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group min-w-[180px]">
          <img
            src={logo}
            alt="Logo Vagafogo"
            className={`w-11 h-11 rounded-full object-cover border-2 transition-all duration-500 ${
              transparente
                ? "border-white/40 group-hover:border-white/80"
                : "border-[#8B4F23]/20 group-hover:border-[#8B4F23]/60"
            }`}
            loading="eager"
          />
          <span className={`font-bold text-xl tracking-wide leading-none transition-colors duration-500 ${
            transparente ? "text-white drop-shadow" : "text-[#8B4F23]"
          }`}>
            VAGAFOGO
          </span>
        </Link>

        {/* Nav Desktop */}
        <nav className="hidden lg:flex flex-1 justify-center gap-8">
          {NAV_LINKS.map(({ href, label, type }) => {
            const classes = `relative font-medium text-base py-1 transition-colors duration-500
                after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5
                after:transition-all after:duration-300 hover:after:w-full ${
                transparente
                  ? "text-white/90 hover:text-white after:bg-white drop-shadow-sm"
                  : "text-[#8B4F23] after:bg-[#8B4F23]"
              }`;
            return type === "route" ? (
              <Link key={href} to={href} className={classes}>
                {label}
              </Link>
            ) : (
              <a key={href} href={href} className={classes}>
                {label}
              </a>
            );
          })}
        </nav>

        {/* Botões Desktop */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/minha-reserva"
            className={`inline-flex items-center gap-1.5 font-medium px-4 py-2 rounded-full text-sm transition-all duration-300 ${
              transparente
                ? "text-white/90 hover:text-white hover:bg-white/15"
                : "text-[#8B4F23] hover:bg-[#8B4F23]/10"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Minha reserva
          </Link>
          <Link
            to="/reservar"
            className={`inline-flex items-center gap-2 font-semibold px-6 py-2.5 rounded-full text-sm shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg min-w-[150px] justify-center ${
              transparente
                ? "bg-white text-[#2D1E0F] hover:bg-white/90"
                : "bg-[#8B4F23] text-white hover:bg-[#A05D2B]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Reservar Agora
          </Link>
        </div>

        {/* Hambúrguer Mobile */}
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className={`lg:hidden p-2 rounded-lg transition-colors ${
            transparente ? "text-white hover:bg-white/15" : "text-[#8B4F23] hover:bg-[#8B4F23]/10"
          }`}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
        >
          <div className="w-6 h-5 flex flex-col justify-between">
            <span className={`block h-0.5 transition-all duration-300 origin-center ${
              transparente ? "bg-white" : "bg-[#8B4F23]"
            } ${menuAberto ? "rotate-45 translate-y-2.5" : ""}`} />
            <span className={`block h-0.5 transition-all duration-300 ${
              transparente ? "bg-white" : "bg-[#8B4F23]"
            } ${menuAberto ? "opacity-0 scale-x-0" : ""}`} />
            <span className={`block h-0.5 transition-all duration-300 origin-center ${
              transparente ? "bg-white" : "bg-[#8B4F23]"
            } ${menuAberto ? "-rotate-45 -translate-y-2" : ""}`} />
          </div>
        </button>
      </div>

      {/* Menu Mobile */}
      <div className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
        menuAberto ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      }`}>
        <div className="bg-white/97 backdrop-blur-md border-t border-[#8B4F23]/10 px-4 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label, type }) => {
            const mobileClass = "py-3 px-3 text-base font-medium text-[#8B4F23] rounded-lg hover:bg-[#8B4F23]/5 border-b border-[#8B4F23]/5 transition-colors";
            return type === "route" ? (
              <Link key={href} to={href} onClick={fecharMenu} className={mobileClass}>
                {label}
              </Link>
            ) : (
              <a key={href} href={href} onClick={fecharMenu} className={mobileClass}>
                {label}
              </a>
            );
          })}
          <Link
            to="/minha-reserva"
            onClick={fecharMenu}
            className="mt-2 w-full flex items-center justify-center gap-2 border border-[#8B4F23]/20 text-[#8B4F23] font-medium px-6 py-3 rounded-full hover:bg-[#8B4F23]/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Consultar minha reserva
          </Link>
          <Link
            to="/reservar"
            onClick={fecharMenu}
            className="mt-2 w-full flex items-center justify-center gap-2 bg-[#8B4F23] text-white font-semibold px-6 py-3 rounded-full shadow-sm hover:bg-[#A05D2B] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Reservar Agora
          </Link>
        </div>
      </div>
    </header>
  );
}
