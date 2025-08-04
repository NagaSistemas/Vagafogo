import educationImg from '../assets/educacaoambiental/educacaoambiental-1.jpg'
export function EducationSection() {
  return (
    <section id="educacao" className="py-16 bg-[#F7FAEF]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <span className="text-green-600 font-semibold uppercase tracking-widest">APRENDIZADO E INTEGRAÇÃO</span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-[#8B4F23] mt-2 mb-4">
            Educação Ambiental
          </h2>
          <p className="max-w-2xl mx-auto text-gray-700 mt-4 text-lg">
            Demonstramos a relação de interdependência do ser humano com a natureza, promovendo proteção e preservação ambiental.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-12 max-w-6xl mx-auto">
          {/* Imagem */}
    
          <div className="lg:w-1/2 w-full h-72 object-cover rounded-2xl shadow-lg" style={{backgroundImage: `url(${educationImg})`}}></div>

          {/* Conteúdo */}
          <div className="lg:w-1/2">
            <h3 className="font-heading text-2xl font-bold text-[#8B4F23] mb-2">
              Projeto para Escolas e Grupos
            </h3>
            <p className="mb-6 text-gray-700 text-base">
              Atividade realizada nas trilhas promovendo interpretação sobre flora, fauna, recursos naturais e sustentabilidade.
            </p>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-gray-700">Para escolas, faculdades e grupos específicos</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-gray-700">Mostra a importância da proteção ambiental local e global</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-yellow-400 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-gray-700">Atividade principal realizada nas trilhas</span>
              </li>
            </ul>

            <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-8">
              <p className="text-yellow-700 flex items-start">
                <svg className="w-5 h-5 text-yellow-500 mt-1 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
                </svg>
                <span>Esta atividade requer agendamento prévio via WhatsApp</span>
              </p>
            </div>

            <div className="mt-4">
              <a
                href="https://wa.me/+5562992225471"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center bg-[#8B4F23] text-white font-bold px-8 py-3 rounded-full shadow hover:bg-[#A05D2B] text-lg transition duration-300 focus:ring-2 focus:ring-offset-2 focus:ring-[#8B4F23]"
              >
                <svg className="w-6 h-6 mr-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
                </svg>
                Agendar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
