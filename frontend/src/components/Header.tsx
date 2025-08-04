import { useState } from "react";
import logo from "../assets/logo.jpg";

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <header className="fixed top-0 left-0 w-full bg-white shadow z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo + Título */}
        <div className="flex items-center min-w-[180px]">
          <img
            src={logo}
            alt="Logo Vagafogo"
            className="w-12 h-12 rounded-full object-cover border border-gray-300"
            loading="lazy"
          />
          <span className="ml-4 font-bold text-2xl text-[#8B4F23] tracking-wide">
            VAGAFOGO
          </span>
        </div>

        {/* Menu Desktop */}
        <nav className="hidden lg:flex flex-1 justify-center gap-10">
          <a href="#inicio" className="text-[#8B4F23] text-lg font-semibold hover:underline">
            Início
          </a>
          <a href="#brunch" className="text-[#8B4F23] text-lg font-semibold hover:underline">
            Brunch
          </a>
          <a href="#trilha" className="text-[#8B4F23] text-lg font-semibold hover:underline">
            Trilha
          </a>
          <a href="#educacao" className="text-[#8B4F23] text-lg font-semibold hover:underline">
            Educação
          </a>
        </nav>

        {/* Botão Reservar */}
        <a
          href="#reservas"
          className="hidden md:block bg-[#8B4F23] text-white font-bold px-8 py-2 rounded-full text-lg shadow hover:bg-[#A05D2B] transition min-w-[170px] text-center"
        >
          Reservar Agora
        </a>

        {/* Botão hamburguer mobile */}
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="lg:hidden text-3xl ml-2 text-[#8B4F23]"
          aria-label="Abrir menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-8 h-8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Menu Mobile */}
      {menuAberto && (
        <div className="lg:hidden absolute top-full left-0 w-full bg-white shadow-md py-5 z-40">
          <div className="flex flex-col gap-4 px-6">
            <a href="#inicio" className="py-2 text-lg font-semibold border-b border-gray-100 text-[#8B4F23]">
              Início
            </a>
            <a href="#brunch" className="py-2 text-lg font-semibold border-b border-gray-100 text-[#8B4F23]">
              Brunch
            </a>
            <a href="#trilha" className="py-2 text-lg font-semibold border-b border-gray-100 text-[#8B4F23]">
              Trilha
            </a>
            <a href="#educacao" className="py-2 text-lg font-semibold border-b border-gray-100 text-[#8B4F23]">
              Educação
            </a>
            <a
              href="#reservas"
              className="bg-[#8B4F23] text-white font-bold px-6 py-2 rounded-full mt-2 text-center"
            >
              Reservar Agora
            </a>
          </div>
        </div>
      )}
      
    </header>
  );
}
