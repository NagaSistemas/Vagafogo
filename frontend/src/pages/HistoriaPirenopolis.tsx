import { Link } from "react-router-dom";
import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { FloatingButtons } from "../components/FloatingButtons";
import { Reveal } from "../components/Reveal";
import { Magnetic } from "../components/Magnetic";
import { Spotlight } from "../components/Spotlight";
import heroImg from "../assets/Carrossel-1.jpg";
import carrossel2 from "../assets/Carrossel-2.jpg";
import carrossel3 from "../assets/Carrossel-3.jpg";
import trilhaImg from "../assets/trilhaecologica/trilhaecologica-3.jpg";
import {
  FaGem,
  FaChurch,
  FaNewspaper,
  FaMountain,
  FaPalette,
  FaRoute,
  FaSeedling,
  FaHorse,
} from "react-icons/fa";

const timeline = [
  { ano: "1727", titulo: "Fundação do arraial", icone: FaGem },
  { ano: "1819", titulo: "Festa do Divino", icone: FaChurch },
  { ano: "1830", titulo: "Primeiro jornal", icone: FaNewspaper },
  { ano: "1890", titulo: "Vira Pirenópolis", icone: FaMountain },
  { ano: "1970", titulo: "Os alternativos", icone: FaSeedling },
  { ano: "1993", titulo: "Era do turismo", icone: FaRoute },
];

export function HistoriaPirenopolis() {
  return (
    <>
      <Header />
      <FloatingButtons />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={heroImg}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              className="h-full w-full object-cover hero-image-active"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,6,2,0.7)] via-[rgba(45,30,15,0.55)] to-[rgba(20,12,5,0.92)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
            <Reveal variant="up" once>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.32em] text-[#E0B13C] mb-5">
                <span className="h-px w-8 bg-[#E0B13C]" />
                Desde 1727
                <span className="h-px w-8 bg-[#E0B13C]" />
              </span>
            </Reveal>
            <Reveal variant="up" delay={200} once as="h1" className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-2xl">
              A História de<br className="hidden sm:block" />
              <em className="not-italic text-[#E0B13C]"> Pirenópolis</em>
            </Reveal>
            <Reveal variant="up" delay={400} once as="p" className="mx-auto mt-8 max-w-2xl text-base md:text-lg text-white/85 leading-relaxed">
              Do arraial das minas de ouro à cidade turística — três séculos de ciclos, fé, arte e reinvenção no coração do cerrado.
            </Reveal>

            <Reveal variant="up" delay={550} once className="mt-8 flex items-center justify-center gap-3">
              <Link
                to="/historia"
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/70 hover:text-[#E0B13C] transition-colors border border-white/20 rounded-full px-4 py-2 hover:border-[#E0B13C]/40"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Ver história da Vagafogo
              </Link>
            </Reveal>
          </div>

          <a
            href="#capitulo-1"
            aria-label="Rolar para baixo"
            className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-white/60 hover:text-white hidden md:flex"
          >
            <span className="animate-bounce">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </span>
          </a>
        </section>

        {/* ============ TIMELINE ============ */}
        <section className="bg-gradient-to-b from-[#F7FAEF] to-[#FAFCF5] py-16 md:py-20 border-y border-[#8B4F23]/10">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="text-center mb-12">
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#8B4F23] bg-[#8B4F23]/10 px-4 py-1.5 rounded-full mb-3 border border-[#8B4F23]/15">
                Linha do Tempo
              </span>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#2D1E0F]">
                Quase <span className="text-[#8B4F23]">300 anos</span> de história
              </h2>
            </Reveal>

            <div className="relative">
              <div className="hidden md:block absolute top-9 left-[8%] right-[8%] h-0.5 bg-gradient-to-r from-transparent via-[#8B4F23]/30 to-transparent" />

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 md:gap-3 relative">
                {timeline.map(({ ano, titulo, icone: Icone }, i) => (
                  <Reveal key={ano} variant="up" delay={i * 80} className="flex flex-col items-center text-center">
                    <div className="relative">
                      <div className="w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-white border-2 border-[#8B4F23]/20 flex items-center justify-center shadow-md transition-all duration-300 hover:scale-110 hover:border-[#E0B13C] hover:shadow-lg group cursor-default">
                        <Icone className="w-6 h-6 text-[#8B4F23] transition-transform duration-300 group-hover:scale-110" />
                      </div>
                    </div>
                    <p className="mt-3 font-bold text-[#8B4F23] text-base">{ano}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-snug max-w-[120px]">{titulo}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ CAPÍTULO 1 — O OURO ============ */}
        <section id="capitulo-1" className="py-20 md:py-28 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaGem className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 1</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>

            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-10">
              O brilho do ouro<br />
              <span className="text-[#8B4F23]">nasce um arraial</span>
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant">
              <p>
                <span className="float-left mr-3 text-7xl font-bold leading-none text-[#8B4F23] font-display">E</span>
                ra <strong>7 de outubro de 1727</strong> quando surgia, em meio às serras do interior goiano, o <em>Arraial das Minas de Nossa Senhora do Rosário de Meia Ponte</em>.
              </p>
              <p>
                Naquela época, o ouro brilhava nos rios e nos sonhos dos bandeirantes que ali se estabeleceram. O pequeno arraial prosperava com a mineração, atraindo gente de todo canto.
              </p>
              <p>
                Mas, como todo ciclo, o do ouro começou a declinar por volta de <strong>1800</strong>.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ CAPÍTULO 2 — A NOVA ERA ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#F7FAEF] to-[#F1F4E5] overflow-hidden">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaChurch className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 2</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-14">
              Fé, festa e <span className="text-[#8B4F23]">letras</span>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-6xl mx-auto">
              <Reveal variant="left" delay={150}>
                <Spotlight color="rgba(224, 177, 60, 0.18)" className="rounded-3xl">
                  <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
                    <img
                      src={carrossel2}
                      alt="Pirenópolis"
                      loading="lazy"
                      className="w-full h-80 lg:h-[480px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10">
                        <p className="text-[10px] font-bold text-[#E0B13C] uppercase tracking-[0.2em]">1800 — 1840</p>
                        <p className="font-bold text-white mt-1">Ciclo da agropecuária</p>
                      </div>
                    </div>
                  </div>
                </Spotlight>
              </Reveal>

              <Reveal variant="right" delay={250} className="prose-elegant">
                <p>
                  Foi então que chegou ao arraial o <strong>Comendador Joaquim Alves</strong>, figura decisiva na nova fase que se iniciava: o <em>ciclo da agropecuária</em>. Com ele, a terra voltou a dar frutos e a economia se manteve viva.
                </p>
                <p>
                  O povo, unido em fé e tradição, criou em <strong>1819</strong> a <strong>Festa do Divino Espírito Santo</strong>, que logo se tornou símbolo da cidade.
                </p>

                <div className="grid grid-cols-2 gap-4 mt-6 not-prose">
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-[#8B4F23]/10 hover:border-[#8B4F23]/30 transition-colors flex items-center gap-3">
                    <FaHorse className="w-7 h-7 text-[#8B4F23] flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#8B4F23]">1826</p>
                      <p className="text-xs text-gray-500">Cavalhadas inauguradas</p>
                    </div>
                  </div>
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-[#8B4F23]/10 hover:border-[#8B4F23]/30 transition-colors flex items-center gap-3">
                    <FaNewspaper className="w-7 h-7 text-[#8B4F23] flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#8B4F23]">1830</p>
                      <p className="text-xs text-gray-500">1º jornal do Centro-Oeste</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal variant="scale" delay={500} className="mt-12 block max-w-4xl mx-auto">
              <blockquote className="relative bg-gradient-to-br from-[#FAF5EB] to-[#F0E6D0] rounded-2xl p-6 md:p-8 border-l-4 border-[#E0B13C] shadow-sm">
                <svg className="absolute top-4 right-4 w-10 h-10 text-[#E0B13C]/30" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/>
                </svg>
                <p className="text-[#2D1E0F] font-display italic text-lg md:text-xl leading-relaxed">
                  O <strong className="not-italic text-[#8B4F23]">Matutina Meiapontense</strong> era o despertar das letras no coração do Brasil — o primeiro jornal do Centro-Oeste brasileiro.
                </p>
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ============ CAPÍTULO 3 — O SILÊNCIO ============ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaMountain className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 3</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-10">
              O silêncio e o <span className="text-[#8B4F23]">novo nome</span>
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant">
              <p>
                Em <strong>1840</strong>, com a morte do comendador, a cidade mergulhou novamente no silêncio. A economia esfriou, e o antigo arraial foi, aos poucos, sendo esquecido.
              </p>
              <p>
                Foi só em <strong>1890</strong> que um novo nome trouxe nova esperança: <strong className="text-[#8B4F23]">Pirenópolis</strong>, em homenagem à imponente <em>Serra dos Pireneus</em> que abraça a cidade.
              </p>
              <p>
                Mesmo assim, a vida seguiu lenta, como se o tempo tivesse parado por ali.
              </p>
            </Reveal>

            <Reveal variant="scale" delay={400} className="mt-10 block">
              <div className="bg-gradient-to-br from-[#FAFCF5] to-[#F1F4E5] rounded-3xl p-8 md:p-10 border border-[#8B4F23]/15 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-[#8B4F23] flex items-center justify-center shadow-lg">
                    <FaMountain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#8B4F23] mb-2">1933 — 1950</p>
                    <h3 className="font-display text-2xl md:text-3xl font-bold text-[#2D1E0F] mb-3 leading-tight">
                      Pedras que ergueram capitais
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Durante a construção de <strong>Goiânia (1933)</strong> e <strong>Brasília (1950)</strong>, a cidade voltou a respirar. Pedras de <strong>quartzito</strong> extraídas de Pirenópolis foram usadas nas construções das novas capitais, gerando algum movimento e renda.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ CAPÍTULO 4 — TURISMO TÍMIDO + ALTERNATIVOS ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#FAFCF5] to-white overflow-hidden">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaSeedling className="w-5 h-5 text-emerald-700" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-700">Capítulo 4</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-14">
              Águas límpidas e <span className="text-emerald-700">novos sonhos</span>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-6xl mx-auto">
              <Reveal variant="left" delay={150} className="prose-elegant order-2 lg:order-1">
                <p>
                  Nos <strong>anos 1960</strong>, com o crescimento de Anápolis, Goiânia e Brasília, muitos moradores dessas cidades passaram a visitar Pirenópolis, encantados com suas águas límpidas e a beleza do <strong>Rio das Almas</strong>. Assim nasceu, de forma tímida, o turismo.
                </p>
                <p>
                  Em <strong>1970</strong>, chegaram os primeiros <em>"alternativos"</em> — jovens como <Link to="/historia" className="text-[#8B4F23] font-semibold hover:underline">Catarina e Evandro</Link>, atraídos pela natureza, pela espiritualidade e pelo desejo de uma vida simples.
                </p>
                <p>
                  Eles abriram caminho para muitos outros, que, nos anos 1980, formaram as primeiras <strong>comunidades alternativas</strong> de Pirenópolis. Foi dessa convivência criativa que nasceu um novo ofício para a cidade: a <strong>ourivesaria em prata</strong>.
                </p>
              </Reveal>

              <Reveal variant="right" delay={250} className="order-1 lg:order-2">
                <Spotlight color="rgba(224, 177, 60, 0.18)" className="rounded-3xl">
                  <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
                    <img
                      src={trilhaImg}
                      alt="Rio das Almas — Pirenópolis"
                      loading="lazy"
                      className="w-full h-80 lg:h-[440px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-[#E0B13C] uppercase tracking-[0.2em]">1970 — 1980</p>
                        <p className="font-display font-bold text-white text-xl">Os primeiros alternativos</p>
                      </div>
                      <span className="text-xs text-white/80 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full flex items-center gap-1">
                        <FaPalette className="w-3 h-3" />
                        Ourivesaria
                      </span>
                    </div>
                  </div>
                </Spotlight>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ CAPÍTULO 5 — TURISMO ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#2D1E0F] via-[#3a2715] to-[#1a120a] overflow-hidden relative">
          <div className="pointer-events-none absolute top-0 right-0 w-96 h-96 rounded-full opacity-15 -translate-y-1/2 translate-x-1/3 bg-[#E0B13C] blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-15 translate-y-1/2 -translate-x-1/3 bg-[#8B4F23] blur-3xl" />

          <div className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#E0B13C]/40" />
              <FaRoute className="w-5 h-5 text-[#E0B13C]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#E0B13C]">Capítulo 5</span>
              <span className="h-px w-12 bg-[#E0B13C]/40" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-white text-center leading-tight mb-10">
              A era do <span className="text-[#E0B13C]">turismo</span>
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant prose-dark max-w-3xl mx-auto">
              <p>
                Finalmente, em <strong>1993</strong>, começa oficialmente um novo ciclo: o turismo como <strong className="text-[#E0B13C]">força econômica</strong>.
              </p>
              <p>
                A cidade passou a receber visitantes de todas as regiões do Brasil, encantados com suas <strong>belezas naturais</strong>, sua <strong>cultura viva</strong> e seu <strong>centro histórico bem preservado</strong>.
              </p>
              <p>
                A construção da <strong className="text-[#E0B13C]">Pousada dos Pireneus</strong> marcou esse novo momento, impulsionando o desenvolvimento da cidade como um dos destinos turísticos mais charmosos do país.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-12">
              {[
                { icone: FaMountain, titulo: "Serra dos Pireneus", desc: "Cenário imponente que dá nome à cidade" },
                { icone: FaChurch, titulo: "Centro histórico", desc: "Construções coloniais preservadas" },
                { icone: FaPalette, titulo: "Arte em prata", desc: "Ourivesaria reconhecida nacionalmente" },
              ].map((item, i) => (
                <Reveal key={item.titulo} variant="up" delay={300 + i * 100}>
                  <Spotlight color="rgba(224, 177, 60, 0.2)" className="rounded-2xl h-full">
                    <div className="h-full bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/[0.08] hover:border-[#E0B13C]/30 group">
                      <div className="w-14 h-14 rounded-full bg-[#E0B13C]/20 border border-[#E0B13C]/40 flex items-center justify-center mx-auto mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                        <item.icone className="w-6 h-6 text-[#E0B13C]" />
                      </div>
                      <p className="font-display font-bold text-white text-lg">{item.titulo}</p>
                      <p className="text-xs text-white/70 mt-1.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA FINAL ============ */}
        <section className="py-20 md:py-24 bg-[#F1F4E5]">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="scale" className="block">
              <div className="relative rounded-[28px] overflow-hidden bg-white border border-[#8B4F23]/10 px-8 py-14 md:px-16 md:py-20 shadow-xl">
                <div className="absolute inset-0 opacity-30">
                  <img src={carrossel3} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/70" />
                </div>

                <div className="relative z-10 max-w-2xl">
                  <Reveal variant="up" delay={150}>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#8B4F23] mb-3">Faça parte dessa história</span>
                  </Reveal>
                  <Reveal variant="up" delay={250} as="h2" className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-[#2D1E0F] leading-[1.1] tracking-tight">
                    Conheça Pirenópolis<br />
                    <span className="text-[#8B4F23]">visitando a Vagafogo</span>
                  </Reveal>
                  <Reveal variant="up" delay={350} as="p" className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed">
                    A Vagafogo nasceu desse movimento alternativo dos anos 70. Reserve sua visita e viva uma parte dessa história.
                  </Reveal>
                  <Reveal variant="up" delay={450} className="mt-8 flex flex-col sm:flex-row gap-3">
                    <Magnetic strength={0.2}>
                      <Link
                        to="/reservar"
                        className="btn-glow group inline-flex items-center justify-center gap-2 bg-[#8B4F23] text-white font-semibold px-8 py-4 rounded-full shadow-xl hover:bg-[#A05D2B] transition-all duration-300 hover:shadow-2xl text-sm whitespace-nowrap"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Reservar Visita
                        <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </Magnetic>
                    <Link
                      to="/historia"
                      className="inline-flex items-center justify-center gap-2 border border-[#8B4F23]/20 bg-white text-[#8B4F23] font-medium px-8 py-4 rounded-full hover:bg-[#8B4F23]/5 hover:border-[#8B4F23]/40 transition-all duration-300 text-sm whitespace-nowrap"
                    >
                      História da Vagafogo
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </Reveal>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}
