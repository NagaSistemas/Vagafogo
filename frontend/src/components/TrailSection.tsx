import HeroImg from '../assets/trilhaecologica/trilhaecologica-1.jpg'
import Trilha from '../assets/trilhaecologica/trilhaecologica-2.jpg'
import { Link } from "react-router-dom"
import { Reveal } from "./Reveal"
import { Magnetic } from "./Magnetic"
import { FaLeaf, FaShieldAlt, FaWater, FaInfoCircle, FaDove } from "react-icons/fa"

const features = [
  { icon: FaLeaf, text: "Espaços estratégicos para descanso e meditação" },
  { icon: FaShieldAlt, text: "Corrimões para segurança em áreas mais íngremes" },
  { icon: FaWater, text: "Piscina natural e uma pequena cachoeira" },
  { icon: FaInfoCircle, text: "Placas informativas sobre flora e fauna do cerrado" },
  { icon: FaDove, text: "182 espécies de pássaros catalogadas" },
];

export function TrailSection() {
  return (
    <section
      id="trilha"
      className="relative overflow-hidden py-20 md:py-28 cv-auto"
    >
      <div className="absolute inset-0">
        <img
          src={HeroImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(15,30,15,0.88)] via-[rgba(20,40,20,0.85)] to-[rgba(10,25,10,0.94)]" />
      </div>

      <div className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-14">
          <Reveal variant="up">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-emerald-300 bg-emerald-400/10 px-4 py-1.5 rounded-full mb-4 border border-emerald-400/20">
              Conexão com a Natureza
            </span>
          </Reveal>
          <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-3">
            Trilha <span className="text-emerald-300">Ecológica</span>
          </Reveal>
          <Reveal variant="up" delay={240} as="p" className="text-gray-200/80 text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
            Mata ciliar primária preservada margeando o Rio Vagafogo.
          </Reveal>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16 max-w-6xl mx-auto">
          <Reveal variant="left" delay={100} className="lg:w-1/2 w-full flex-shrink-0">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/10 group">
              <img
                src={Trilha}
                alt="Trilha Mãe da Floresta - Santuário Vagafogo"
                loading="lazy"
                decoding="async"
                className="w-full h-72 lg:h-[440px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              <div className="absolute bottom-5 left-5 right-5">
                <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10">
                  <h3 className="font-bold text-white text-base">Trilha Mãe da Floresta</h3>
                  <p className="text-emerald-300 text-xs mt-1 tracking-wide">
                    Mata ciliar primária preservada · 1.530m
                  </p>
                </div>
              </div>

              <div className="absolute top-5 right-5 flex items-center gap-2 rounded-full bg-emerald-500/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Aberto hoje
              </div>
            </div>
          </Reveal>

          <Reveal variant="right" delay={200} className="lg:w-1/2 text-white">
            <h3 className="text-2xl lg:text-3xl font-bold mb-4 leading-tight">
              Caminhada Imersiva de 1.530m
            </h3>
            <p className="mb-6 text-gray-300/90 leading-relaxed">
              Nossa trilha ecológica atravessa uma belíssima mata ciliar primária preservada, margeando o Rio Vagafogo. A trilha é completamente protegida por madeiramento, oferecendo conforto e segurança ao visitante.
            </p>

            <ul className="space-y-3 mb-8">
              {features.map(({ icon: Icon, text }, i) => (
                <Reveal key={i} variant="left" delay={300 + i * 80} as="li" className="flex items-center gap-3.5 group cursor-default">
                  <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center transition-all duration-300 group-hover:bg-emerald-500/30 group-hover:border-emerald-400 group-hover:scale-110 group-hover:rotate-3">
                    <Icon className="w-4 h-4 text-emerald-300 transition-transform duration-300 group-hover:scale-110" />
                  </span>
                  <span className="text-gray-200/90 text-sm leading-relaxed transition-colors duration-300 group-hover:text-white">{text}</span>
                </Reveal>
              ))}
            </ul>

            <Reveal variant="up" delay={700} className="flex flex-wrap gap-3">
              <Magnetic strength={0.2}>
              <Link
                to="/reservar"
                className="btn-glow group inline-flex items-center gap-2 bg-white text-[#2D1E0F] font-semibold px-7 py-3.5 rounded-full shadow-xl hover:bg-gray-50 text-sm transition-all duration-300 hover:shadow-2xl"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Agendar Trilha
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              </Magnetic>
              <a
                href="#educacao"
                className="inline-flex items-center gap-2 border border-white/30 bg-white/5 backdrop-blur-sm text-white font-medium px-7 py-3.5 rounded-full hover:bg-white/10 hover:border-white/50 text-sm transition-all duration-300"
              >
                Educação Ambiental
              </a>
            </Reveal>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
