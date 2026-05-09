import { Link } from "react-router-dom";
import { useConfigSite } from "../hooks/useConfigSite";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { config } = useConfigSite();

  return (
    <footer className="bg-[#2D1E0F] text-white">
      {/* Divisor decorativo */}
      <div className="h-1 w-full bg-gradient-to-r from-[#8B4F23] via-[#E0B13C] to-[#8B4F23]" />

      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Coluna 1: Marca */}
          <div className="lg:col-span-1">
            <h3 className="text-xl font-bold text-white mb-1 tracking-wide">VAGAFOGO</h3>
            <p className="text-[#E0B13C] text-xs font-semibold uppercase tracking-widest mb-4">Santuário Natural</p>
            <p className="text-gray-300 text-sm leading-relaxed">
              Uma experiência gastronômica única aliada à beleza do cerrado goiano. Natureza, sabor e memórias que ficam.
            </p>
            {/* Redes sociais */}
            <div className="flex gap-3 mt-5">
              <a
                href="https://www.instagram.com/vagafogo/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#8B4F23] transition-colors duration-200"
                aria-label="Instagram Vagafogo"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a
                href="https://wa.me/5562992225471"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#25D366] transition-colors duration-200"
                aria-label="WhatsApp Vagafogo"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Coluna 2: Experiências */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-[#E0B13C] mb-4">Experiências</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#brunch" className="text-gray-300 text-sm hover:text-white transition-colors flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#E0B13C]" />
                  Brunch Gastronômico
                </a>
              </li>
              <li>
                <a href="#trilha" className="text-gray-300 text-sm hover:text-white transition-colors flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#E0B13C]" />
                  Trilha Mãe da Floresta
                </a>
              </li>
              <li>
                <a href="#educacao" className="text-gray-300 text-sm hover:text-white transition-colors flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#E0B13C]" />
                  Educação Ambiental
                </a>
              </li>
              <li>
                <Link to="/reservar" className="text-gray-300 text-sm hover:text-white transition-colors flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#E0B13C]" />
                  Fazer Reserva
                </Link>
              </li>
              <li>
                <Link to="/minha-reserva" className="text-gray-300 text-sm hover:text-white transition-colors flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#E0B13C]" />
                  Consultar Minha Reserva
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Informações */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-[#E0B13C] mb-4">Informações</h4>
            <ul className="space-y-2.5">
              <li className="text-gray-300 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-[#E0B13C] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Pirenópolis, Goiás – Brasil</span>
              </li>
              <li className="text-gray-300 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-[#E0B13C] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
                </svg>
                <a href="https://wa.me/5562992225471" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  (62) 99222-5471
                </a>
              </li>
              {config.textoFuncionamento && (
                <li className="text-gray-300 text-sm flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 text-[#E0B13C] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{config.textoFuncionamento}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Coluna 4: CTA */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-[#E0B13C] mb-4">Reserve sua visita</h4>
            <p className="text-gray-300 text-sm mb-4 leading-relaxed">
              Garanta seu lugar nessa experiência única no coração do cerrado goiano.
            </p>
            <Link
              to="/reservar"
              className="inline-flex items-center gap-2 bg-[#8B4F23] text-white font-semibold px-5 py-2.5 rounded-full text-sm shadow hover:bg-[#A05D2B] transition-colors duration-200 w-full justify-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Reservar Agora
            </Link>
            <a
              href="https://wa.me/5562992225471"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 border border-white/20 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-white/10 transition-colors duration-200 w-full justify-center"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
              </svg>
              Fale pelo WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-gray-400 text-xs">
            © {currentYear} Santuário Vagafogo. Todos os direitos reservados.
          </p>
          <p className="text-gray-500 text-xs">
            Pirenópolis · Goiás · Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
