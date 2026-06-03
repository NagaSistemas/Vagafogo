import BrunchImg from '../assets/hero/hero-2.jpg'
import laticImg1 from '../assets/brunch/laticinios/brunch-1.jpg'
import laticImg2 from '../assets/brunch/laticinios/brunch-2.jpg'
import laticImg3 from '../assets/brunch/laticinios/brunch-3.jpg'
import { Link } from "react-router-dom"
import { Reveal } from "./Reveal"
import { useConfigSite } from "../hooks/useConfigSite"

const cards = [
  {
    img: laticImg1,
    title: "Laticínios Artesanais",
    description: "Queijos, iogurtes e manteigas produzidos na própria fazenda com leite fresco e técnicas artesanais tradicionais.",
  },
  {
    img: laticImg2,
    title: "Frutas do Cerrado",
    description: "Pequi, buriti, cagaita e mais, colhidos em manejo sustentável. O sabor autêntico do cerrado goiano na sua mesa.",
  },
  {
    img: laticImg3,
    title: "Harmonizações Exclusivas",
    description: "14 combinações únicas criadas pelo nosso chef, que exaltam os sabores locais em experiências gastronômicas memoráveis.",
  },
];

export function BrunchSection() {
  const { config } = useConfigSite();

  return (
    <section
      id="brunch"
      className="relative overflow-hidden py-20 md:py-28 cv-auto"
    >
      <div className="absolute inset-0">
        <img
          src={BrunchImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(45,30,15,0.86)] via-[rgba(45,30,15,0.82)] to-[rgba(20,12,5,0.92)]" />
      </div>

      <div className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-14">
          <Reveal variant="up">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#E0B13C] bg-[#E0B13C]/15 px-4 py-1.5 rounded-full mb-4 border border-[#E0B13C]/20">
              Descubra a Gastronomia
            </span>
          </Reveal>
          <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-5">
            Brunch <span className="text-[#E0B13C]">Vagafogo</span>
          </Reveal>
          <Reveal variant="up" delay={240} as="p" className="text-gray-200/90 text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
            Um festival gastronômico com <strong className="text-[#E0B13C] font-semibold">45 itens</strong> e derivados do leite produzido na fazenda, além de frutas do cerrado cultivadas no local em manejo sustentável.
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {cards.map((card, i) => (
            <Reveal key={i} variant="up" delay={120 + i * 140} className="h-full">
              <article className="group h-full relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-500 hover:bg-white/[0.08] hover:border-[#E0B13C]/30 hover:-translate-y-1 hover:shadow-2xl">
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={card.img}
                    alt={card.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                </div>

                <div className="p-6">
                  <h3 className="font-bold text-lg text-white mb-2 leading-snug">{card.title}</h3>
                  <p className="text-gray-300/90 text-sm leading-relaxed">{card.description}</p>
                </div>

                <div className="absolute top-4 right-4 h-8 w-8 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-[#E0B13C]">
                  {i + 1}
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal variant="up" delay={200} className="text-center mt-14 block">
          <Link
            to="/reservar"
            className="group inline-flex items-center gap-2.5 bg-[#8B4F23] text-white font-semibold px-8 py-4 rounded-full shadow-xl shadow-black/30 hover:bg-[#A05D2B] text-base transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Reservar Experiência Gastronômica
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          {config.textoFuncionamento && (
            <p className="text-gray-400 text-sm mt-4 flex items-center justify-center gap-2">
              <span className="inline-block h-1 w-1 rounded-full bg-[#E0B13C]" />
              {config.textoFuncionamento}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
