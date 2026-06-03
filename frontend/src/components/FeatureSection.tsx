import { Link } from "react-router-dom";
import { Reveal } from "./Reveal";

const features = [
  {
    icon: (
      <svg className="w-7 h-7 text-[#8B4F23]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    tag: "Gastronomia",
    title: "Brunch Gastronômico",
    description:
      "45 itens e 14 harmonizações exclusivas com laticínios artesanais produzidos na fazenda e frutas do cerrado em manejo sustentável.",
    cta: { type: "link" as const, href: "/reservar", label: "Ver pacotes" },
    accent: "#E0B13C",
  },
  {
    icon: (
      <svg className="w-7 h-7 text-[#8B4F23]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    tag: "Natureza",
    title: "Trilha Mãe da Floresta",
    description:
      "1.530m por mata ciliar primária margeando o Rio Vagafogo, com 182 espécies de pássaros catalogadas. Piscina natural e cachoeira.",
    cta: { type: "link" as const, href: "/reservar", label: "Agendar trilha" },
    accent: "#4CAF50",
  },
  {
    icon: (
      <svg className="w-7 h-7 text-[#8B4F23]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    tag: "Educação",
    title: "Educação Ambiental",
    description:
      "Projeto para escolas, faculdades e grupos. Trilhas guiadas com interpretação sobre flora, fauna, recursos naturais e sustentabilidade.",
    cta: { type: "whatsapp" as const, href: "https://wa.me/5562992225471", label: "Agendar via WhatsApp" },
    accent: "#2196F3",
  },
];

export function FeatureSection() {
  return (
    <section className="relative py-20 md:py-28 bg-gradient-to-b from-[#F7FAEF] via-[#F7FAEF] to-[#F1F4E5] cv-auto overflow-hidden">
      {/* Decorativo sutil */}
      <div className="pointer-events-none absolute -top-40 -right-32 h-96 w-96 rounded-full bg-[#E0B13C]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[#8B4F23]/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Reveal variant="up">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#8B4F23] bg-[#8B4F23]/10 px-4 py-1.5 rounded-full mb-4 border border-[#8B4F23]/15">
              Por que escolher o Vagafogo
            </span>
          </Reveal>
          <Reveal variant="up" delay={120} as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold text-[#2D1E0F] leading-[1.1] tracking-tight">
            Uma Experiência <span className="text-[#8B4F23]">que Transforma</span>
          </Reveal>
          <Reveal variant="up" delay={240} as="p" className="mt-5 text-gray-600 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Gastronomia de excelência, natureza preservada e educação ambiental em um só lugar.
          </Reveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
          {features.map((feature, i) => (
            <Reveal key={i} variant="up" delay={100 + i * 120} className="h-full">
              <div className="group h-full relative bg-white rounded-3xl shadow-sm border border-gray-100/80 overflow-hidden hover:shadow-2xl hover:-translate-y-1.5 transition-[box-shadow,transform] duration-500 flex flex-col">
              <div className="h-1 w-full transition-all duration-500 group-hover:h-1.5" style={{ backgroundColor: feature.accent }} />

              <div className="p-7 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${feature.accent}18` }}
                  >
                    {feature.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-400">
                    {feature.tag}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-[#2D1E0F] mb-3 leading-tight">
                  {feature.title}
                </h3>

                <p className="text-gray-500 text-sm leading-relaxed flex-1">
                  {feature.description}
                </p>

                <div className="mt-6 pt-5 border-t border-gray-100">
                  {feature.cta.type === "link" ? (
                    <Link
                      to={feature.cta.href}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8B4F23] hover:text-[#A05D2B] transition-colors group/link"
                    >
                      {feature.cta.label}
                      <svg className="w-4 h-4 transition-transform duration-200 group-hover/link:translate-x-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <a
                      href={feature.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8B4F23] hover:text-[#A05D2B] transition-colors group/link"
                    >
                      {feature.cta.label}
                      <svg className="w-4 h-4 transition-transform duration-200 group-hover/link:translate-x-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal variant="up" delay={200} className="mt-16 block">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-white/80 backdrop-blur-sm rounded-3xl shadow-md border border-white/60 p-7 lg:p-9">
            {[
              { value: "45+", label: "Itens no Brunch" },
              { value: "182", label: "Espécies de Aves" },
              { value: "1.530m", label: "Trilha Ecológica" },
              { value: "14", label: "Harmonizações Únicas" },
            ].map((stat, i) => (
              <Reveal key={i} variant="scale" delay={300 + i * 100} className="text-center">
                <div className="group">
                  <p className="text-3xl md:text-4xl font-bold text-[#8B4F23] tracking-tight transition-transform duration-300 group-hover:scale-105">
                    {stat.value}
                  </p>
                  <p className="text-[11px] md:text-xs text-gray-500 mt-2 uppercase tracking-[0.18em] font-medium">
                    {stat.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
