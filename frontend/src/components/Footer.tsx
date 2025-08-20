'use client';
import logo from '../assets/logo/logo.jpg'
export function Footer() {
  return (
    <footer className="bg-[#302110] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo e Social */}
          <div>
            <div className="flex items-center mb-4">
              <img
                src={logo}
                alt="Logo Vagafogo"
                className="w-12 h-12 rounded-full object-cover border border-white"
                loading="lazy"
              />
              <span className="ml-3 font-heading font-bold text-2xl">VAGAFOGO</span>
            </div>
            <p className="text-gray-300 mb-4 leading-snug">
              Experiências gastronômicas e aventuras ecológicas no <br />
              coração do cerrado brasileiro.
            </p>
            <div className="flex space-x-6 mt-2">
              <a href="#" className="text-gray-300 hover:text-yellow-400 transition">
                <i className="fab fa-facebook-f text-2xl"></i>
              </a>
              <a href="#" className="text-gray-300 hover:text-yellow-400 transition">
                <i className="fab fa-instagram text-2xl"></i>
              </a>
              <a href="#" className="text-gray-300 hover:text-yellow-400 transition">
                <i className="fab fa-whatsapp text-2xl"></i>
              </a>
            </div>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-heading font-bold text-2xl mb-4">Contato</h3>
            <div className="space-y-3 text-base">
              <p className="flex items-center text-gray-300">
                <i className="fas fa-map-marker-alt mr-3 text-yellow-400"></i>
                Estrada Rural, Km 15 - Cerrado, Brasil
              </p>
              <p className="flex items-center text-gray-300">
                <i className="fas fa-phone mr-3 text-yellow-400"></i>
                62 9222-5471
              </p>
              <p className="flex items-center text-gray-300">
                <i className="fas fa-envelope mr-3 text-yellow-400"></i>
                contato@vagafogo.com.br
              </p>
            </div>
          </div>

          {/* Horários */}
          <div>
            <h3 className="font-heading font-bold text-2xl mb-4">Horários</h3>
            <div className="space-y-2 text-gray-300 text-base">
              <p>
                <span className="font-bold text-white">Brunch:</span> Todos os dias - 9h, 11h e 13h
              </p>
              <p>
                <span className="font-bold text-white">Trilha:</span> Todos os dias - 9h às 16h
              </p>
              <p>
                <span className="font-bold text-white">Educação Ambiental:</span> Agendamento prévio
              </p>
            </div>
          </div>
        </div>

        {/* Linha divisória */}
        <div className="border-t border-gray-500 mt-8 mb-2"></div>

        {/* Seta animada */}
        <div className="flex justify-center">
        </div>

        {/* Rodapé */}
        <div className="text-center mt-2">
          <p className="text-gray-300 text-base">
            © 2025 Vagafogo. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
