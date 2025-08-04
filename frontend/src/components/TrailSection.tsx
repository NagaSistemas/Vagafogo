import HeroImg from '../assets/trilhaecologica/trilhaecologica-1.jpg'
import Trilha from '../assets/trilhaecologica/trilhaecologica-2.jpg'
export function TrailSection() {
  return (
    <section
      id="trilha"
      className="py-16 md:py-24"
      style={{
        background: `linear-gradient(rgba(45,30,15,0.7),rgba(45,30,15,0.7)), url(${HeroImg})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <span className="text-white font-semibold uppercase tracking-widest">CONEXÃO COM A NATUREZA</span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-white mt-2 mb-4">Trilha Ecológica</h2>
        </div>
        <div className="flex flex-col lg:flex-row items-center gap-10 max-w-5xl mx-auto">
          {/* Imagem */}
          <div className="lg:w-1/2 mb-6 lg:mb-0">
            <div className="bg-white/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
              <div className="relative h-96">
                <div
                  className="h-full w-full bg-cover bg-center rounded-2xl"
                  style={{
                    backgroundImage: `url(${Trilha})`,
                  }}
                ></div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <h3 className="font-heading text-xl font-bold text-white">Trilha Mãe da Floresta</h3>
                </div>
              </div>
            </div>
          </div>
          {/* Texto */}
          <div className="lg:w-1/2 text-white">
            <h3 className="font-heading text-2xl font-bold mb-4">Caminhada Imersiva de 1500m</h3>
            <p className="mb-6 text-gray-200">
              Nossa trilha ecológica atravessa uma belíssima mata ciliar primária preservada. A trilha é completamente protegida por madeiramento, oferecendo conforto e segurança ao visitante.
            </p>
            <ul className="space-y-4 mb-8 text-base">
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span>Espaços estratégicos para descanso e meditação</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span>Corrimões para segurança em áreas mais íngremes</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span>Piscina natural e uma pequena cachoeira </span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span>Placas informativas sobre flora e fauna do cerrado</span>
              </li>
            </ul>
            <a
              href="#reservas"
              className="bg-white text-[#8B4F23] font-semibold px-8 py-3 rounded-full shadow hover:bg-gray-100 text-lg transition duration-300 focus:ring-2 focus:ring-offset-2 focus:ring-white flex items-center justify-center w-max"
            >
              <i className="fas fa-hiking mr-2"></i> Agendar Trilha
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
