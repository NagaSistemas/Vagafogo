import educationImg from '../assets/educacaoambiental/educacaoambiental-1.jpg'
import { Reveal } from "./Reveal"

const featuresList = [
  "Para escolas, faculdades e grupos específicos",
  "Interpretação sobre fauna e flora do cerrado",
  "Importância da proteção ambiental local e global",
  "Atividade principal realizada nas trilhas com monitor",
];

export function EducationSection() {
  return (
    <section id="educacao" className="py-20 md:py-28 bg-gradient-to-b from-white to-[#FAFCF5] cv-auto">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-14">
          <Reveal variant="up">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-emerald-700 bg-emerald-100 px-4 py-1.5 rounded-full mb-4 border border-emerald-200">
              Aprendizado e Integração
            </span>
          </Reveal>
          <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-[#2D1E0F] leading-[1.1] tracking-tight mb-5">
            Educação <span className="text-emerald-700">Ambiental</span>
          </Reveal>
          <Reveal variant="up" delay={240} as="p" className="max-w-3xl mx-auto text-gray-600 text-base md:text-lg leading-relaxed">
            Demonstramos a relação de interdependência do ser humano com a natureza, promovendo proteção e preservação ambiental.
          </Reveal>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16 max-w-6xl mx-auto">
          <Reveal variant="left" delay={100} className="lg:w-1/2 w-full flex-shrink-0">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
              <img
                src={educationImg}
                alt="Educação ambiental no Santuário Vagafogo"
                loading="lazy"
                decoding="async"
                className="w-full h-72 lg:h-[440px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 bg-white/95 backdrop-blur-sm rounded-2xl px-5 py-4 shadow-xl border border-white/40">
                <p className="text-[10px] font-bold text-[#8B4F23] uppercase tracking-[0.2em]">Atividade guiada</p>
                <p className="text-sm font-semibold text-gray-800 mt-1">Trilhas com monitores ambientais</p>
              </div>
            </div>
          </Reveal>

          <Reveal variant="right" delay={200} className="lg:w-1/2">
            <h3 className="text-2xl lg:text-3xl font-bold text-[#2D1E0F] mb-4 leading-tight">
              Projeto para Escolas e Grupos
            </h3>
            <p className="mb-6 text-gray-600 text-base leading-relaxed">
              Atividade realizada nas trilhas com interpretação ambiental sobre flora, fauna, recursos naturais e sustentabilidade. Ideal para grupos escolares, universitários e corporativos.
            </p>

            <ul className="space-y-3.5 mb-8">
              {featuresList.map((item, i) => (
                <Reveal key={i} variant="left" delay={300 + i * 80} as="li" className="flex items-start gap-3 group">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center mt-0.5 transition-all duration-300 group-hover:bg-emerald-200">
                    <svg className="w-3 h-3 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-gray-600 text-sm leading-relaxed pt-0.5">{item}</span>
                </Reveal>
              ))}
            </ul>

            <Reveal variant="scale" delay={700} className="bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200/80 rounded-2xl p-4 mb-6 flex items-start gap-3 block">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-amber-900 text-sm leading-relaxed">
                <strong>Agendamento prévio obrigatório.</strong> Entre em contato via WhatsApp para verificar disponibilidade e condições especiais para grupos.
              </p>
            </Reveal>

            <Reveal variant="up" delay={850} className="block">
              <a
                href="https://wa.me/5562992225471"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 bg-[#25D366] text-white font-semibold px-8 py-4 rounded-full shadow-lg shadow-emerald-500/20 hover:bg-[#1ebe5d] text-base transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
                </svg>
                Agendar por WhatsApp
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </Reveal>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
