export function FeatureSection() {
  return (
    <section className="py-16 bg-gray-100">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-10">
          <span className="text-green-600 font-semibold tracking-widest uppercase text-sm">
            POR QUE ESCOLHER O VAGAFOGO
          </span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-[#8B4F23] mt-2 mb-6">
            Uma Experiência que Transforma
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-xl p-8 shadow-lg text-center border-t-4 border-accent scroll-reveal show" style={{ borderTopColor: '#E0B13C' }}>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              {/* SVG Ícone: Utensílios */}
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-heading text-xl font-bold text-[#8B4F23] mb-3">
              Brunch Gastronômico – <span className="whitespace-nowrap">R$115,00</span>
            </h3>
            <p className="text-gray-600 text-base">
              45 itens e 14 harmonizações únicas com derivados do leite local e frutas do cerrado em manejo sustentável.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-xl p-8 shadow-lg text-center border-t-4" style={{ borderTopColor: '#E0B13C' }}>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              {/* SVG Ícone: Árvore */}
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20m6-6l-6 6-6-6" />
              </svg>
            </div>
            <h3 className="font-heading text-xl font-bold text-[#8B4F23] mb-3">
              Trilha Mãe da Floresta – <span className="whitespace-nowrap">R$30,00</span>
            </h3>
            <p className="text-gray-600 text-base">
              1.530m por mata ciliar primária margeando o rio Vagafogo, com 182 espécies de pássaros catalogadas.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-xl p-8 shadow-lg text-center border-t-4" style={{ borderTopColor: '#E0B13C' }}>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              {/* SVG Ícone: Graduação */}
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4-8 4-8-4 8-4zm0 7v6m0 6a2 2 0 002-2h-4a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-heading text-xl font-bold text-[#8B4F23] mb-3">
              Educação Ambiental – <span className="whitespace-nowrap">Agendamento via WhatsApp</span>
            </h3>
            <p className="text-gray-600 text-base">
              Projeto voltado para escolas, faculdades e grupos específicos, promovendo compreensão sobre flora, fauna e sustentabilidade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
