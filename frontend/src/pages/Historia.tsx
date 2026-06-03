import { Link } from "react-router-dom";
import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { FloatingButtons } from "../components/FloatingButtons";
import { Reveal } from "../components/Reveal";
import { Magnetic } from "../components/Magnetic";
import { Spotlight } from "../components/Spotlight";
import heroImg from "../assets/hero/hero-1.jpg";
import trilhaImg from "../assets/trilhaecologica/trilhaecologica-1.jpg";
import brunchImg from "../assets/brunch/laticinios/brunch-3.jpg";
import educacaoImg from "../assets/educacaoambiental/educacaoambiental-1.jpg";
import {
  FaGlobeEurope,
  FaMapMarkedAlt,
  FaSeedling,
  FaTree,
  FaHandshake,
  FaUsers,
  FaLeaf,
} from "react-icons/fa";

const timeline = [
  { ano: "1973", titulo: "Encontro com Pirenópolis", icone: FaMapMarkedAlt },
  { ano: "1975", titulo: "Compra do terreno", icone: FaHandshake },
  { ano: "1979", titulo: "Vida na fazenda", icone: FaSeedling },
  { ano: "1989", titulo: "Criação da RPPN", icone: FaTree },
  { ano: "1992", titulo: "Inauguração do Santuário", icone: FaLeaf },
  { ano: "Hoje", titulo: "Nova geração", icone: FaUsers },
];

export function Historia() {
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
            <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,6,2,0.65)] via-[rgba(45,30,15,0.55)] to-[rgba(20,12,5,0.92)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
            <Reveal variant="up" once>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.32em] text-[#E0B13C] mb-5">
                <span className="h-px w-8 bg-[#E0B13C]" />
                Desde 1979
                <span className="h-px w-8 bg-[#E0B13C]" />
              </span>
            </Reveal>
            <Reveal variant="up" delay={200} once as="h1" className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight text-white drop-shadow-2xl">
              Onde Tudo<br className="hidden sm:block" />
              <em className="not-italic text-[#E0B13C]"> Começou</em>
            </Reveal>
            <Reveal variant="up" delay={400} once as="p" className="mx-auto mt-8 max-w-2xl text-base md:text-lg text-white/85 leading-relaxed">
              A história de Evandro e Catarina — dois brasileiros que se encontraram do outro lado do mundo e plantaram raízes no coração do cerrado.
            </Reveal>
          </div>

          {/* Indicador de scroll */}
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
                Mais de <span className="text-[#8B4F23]">50 anos</span> de história
              </h2>
            </Reveal>

            <div className="relative">
              {/* Linha horizontal de conexão (desktop) */}
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

        {/* ============ CAPÍTULO 1 — O ENCONTRO ============ */}
        <section id="capitulo-1" className="py-20 md:py-28 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaGlobeEurope className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 1</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>

            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-10">
              Dois brasileiros se encontram<br />
              <span className="text-[#8B4F23]">do outro lado do mundo</span>
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant">
              <p>
                <span className="float-left mr-3 text-7xl font-bold leading-none text-[#8B4F23] font-display">E</span>
                vandro, mineiro de Alfenas, e <strong>Catarina</strong>, paulistana, são dois brasileiros que acabaram se encontrando do outro lado do mundo, em uma comunidade alternativa chamada <em>Saint Martem Latem</em>, na Bélgica. Juntos, percorreram diversos países da Europa e da Ásia, vivenciando diferentes modos de vida e culturas.
              </p>
              <p>
                Após essa intensa jornada, perceberam que <strong>o melhor lugar para viver ainda era o Brasil</strong>.
              </p>
              <p>
                Escolheram Brasília como ponto de partida — uma cidade promissora, ideal para "fazer o pé de meia" enquanto a vida não lhes mostrava um novo rumo.
              </p>
            </Reveal>

            <Reveal variant="scale" delay={400} className="mt-10 block">
              <blockquote className="relative bg-gradient-to-br from-[#FAF5EB] to-[#F0E6D0] rounded-2xl p-6 md:p-8 border-l-4 border-[#E0B13C] shadow-sm">
                <svg className="absolute top-4 right-4 w-10 h-10 text-[#E0B13C]/30" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/>
                </svg>
                <p className="text-[#2D1E0F] font-display italic text-lg md:text-xl leading-relaxed">
                  Foi então que, em <strong className="not-italic text-[#8B4F23]">1973</strong>, receberam um convite para conhecer Pirenópolis. Encantados com o lugar, decidiram ali apostar suas energias e sonhos.
                </p>
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* ============ CAPÍTULO 2 — A FAZENDA ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#F7FAEF] to-[#F1F4E5] overflow-hidden">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaSeedling className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 2</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-14">
              Raízes em <span className="text-[#8B4F23]">Pirenópolis</span>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-6xl mx-auto">
              <Reveal variant="left" delay={150}>
                <Spotlight color="rgba(224, 177, 60, 0.18)" className="rounded-3xl">
                  <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
                    <img
                      src={trilhaImg}
                      alt="Mata da Vagafogo"
                      loading="lazy"
                      className="w-full h-80 lg:h-[480px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10">
                        <p className="text-[10px] font-bold text-[#E0B13C] uppercase tracking-[0.2em]">1975</p>
                        <p className="font-bold text-white mt-1">Compra do terreno</p>
                      </div>
                    </div>
                  </div>
                </Spotlight>
              </Reveal>

              <Reveal variant="right" delay={250} className="prose-elegant">
                <p>
                  Com o dinheiro que haviam guardado para realizar o sonho de adquirir terras, compraram um pedaço de chão em <strong>1975</strong>. E foi em <strong>1979</strong> que passaram a viver definitivamente na <span className="text-[#8B4F23] font-semibold">Fazenda Vagafogo</span>.
                </p>
                <p>
                  Para sustentar a família, começaram a vender produtos da fazenda em Brasília, atividade que mantiveram por cerca de <strong>dez anos</strong>.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-6 not-prose">
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-[#8B4F23]/10 hover:border-[#8B4F23]/30 transition-colors">
                    <p className="text-3xl font-bold text-[#8B4F23]">10</p>
                    <p className="text-xs text-gray-500 mt-1">anos vendendo em Brasília</p>
                  </div>
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-[#8B4F23]/10 hover:border-[#8B4F23]/30 transition-colors">
                    <p className="text-3xl font-bold text-[#8B4F23]">1979</p>
                    <p className="text-xs text-gray-500 mt-1">vida definitiva na fazenda</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ CAPÍTULO 3 — SANTUÁRIO ============ */}
        <section className="py-20 md:py-28 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaTree className="w-5 h-5 text-emerald-700" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-700">Capítulo 3</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-10">
              Um <span className="text-emerald-700">santuário</span> nasce
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant">
              <p>
                Em <strong>1989</strong>, a trajetória da fazenda tomou um novo rumo com o apoio da <strong>Funatura</strong> – Fundação Pró-Natureza –, que, junto ao financiamento da WWF, da Fundação O Boticário e do British Council, viabilizou a criação de uma <strong>RPPN</strong> – Reserva Particular do Patrimônio Natural –, conhecida como <em>Santuário de Vida Silvestre</em>.
              </p>
              <p>
                O projeto foi estruturado com Plano de Manejo e um Centro de Visitantes, abrindo espaço para o <strong>turismo ecológico</strong>, a <strong>educação ambiental</strong> e a <strong>observação da natureza</strong>.
              </p>
            </Reveal>

            <Reveal variant="scale" delay={400} className="mt-10 block">
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-3xl p-8 md:p-10 border border-emerald-200/60 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
                    <FaLeaf className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-700 mb-2">1992 — Marco histórico</p>
                    <h3 className="font-display text-2xl md:text-3xl font-bold text-[#2D1E0F] mb-3 leading-tight">
                      Inauguração com o Príncipe Philip
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      A inauguração ocorreu com a presença de <strong>autoridades locais</strong> e do <strong>Príncipe Philip</strong>. Com recursos da Embaixada Britânica e madeira doada pelo IBAMA, foram construídas passarelas para proteger as trilhas mais sensíveis da mata.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ CAPÍTULO 4 — FAMÍLIA ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#FAFCF5] to-white overflow-hidden">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#8B4F23]/30" />
              <FaUsers className="w-5 h-5 text-[#8B4F23]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#8B4F23]">Capítulo 4</span>
              <span className="h-px w-12 bg-[#8B4F23]/30" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-[#2D1E0F] text-center leading-tight mb-14">
              Uma família, <span className="text-[#8B4F23]">um legado</span>
            </Reveal>

            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-6xl mx-auto">
              <Reveal variant="left" delay={150} className="prose-elegant order-2 lg:order-1">
                <p>
                  Durante essa caminhada, <strong>Evandro</strong> e <strong>Catarina</strong> formaram uma família e criaram seus dois filhos na fazenda: <span className="text-[#8B4F23] font-semibold">Uirá</span> e <span className="text-[#8B4F23] font-semibold">Maíra</span>.
                </p>
                <p>
                  Ambos cresceram em contato direto com a terra, os ciclos da natureza e os valores que sempre nortearam o projeto de vida de seus pais.
                </p>
              </Reveal>

              <Reveal variant="right" delay={250} className="order-1 lg:order-2">
                <Spotlight color="rgba(224, 177, 60, 0.18)" className="rounded-3xl">
                  <div className="relative rounded-3xl overflow-hidden shadow-2xl group">
                    <img
                      src={educacaoImg}
                      alt="Família na Vagafogo"
                      loading="lazy"
                      className="w-full h-80 lg:h-[440px] object-cover transition-transform duration-[1500ms] group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-[#E0B13C] uppercase tracking-[0.2em]">Geração 1</p>
                        <p className="font-display font-bold text-white text-xl">Evandro & Catarina</p>
                      </div>
                      <span className="text-xs text-white/80 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full">Fundadores</span>
                    </div>
                  </div>
                </Spotlight>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ CAPÍTULO 5 — HOJE ============ */}
        <section className="py-20 md:py-28 bg-gradient-to-b from-[#2D1E0F] via-[#3a2715] to-[#1a120a] overflow-hidden relative">
          <div className="pointer-events-none absolute top-0 right-0 w-96 h-96 rounded-full opacity-15 -translate-y-1/2 translate-x-1/3 bg-[#E0B13C] blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-15 translate-y-1/2 -translate-x-1/3 bg-[#8B4F23] blur-3xl" />

          <div className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="up" className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-12 bg-[#E0B13C]/40" />
              <FaUsers className="w-5 h-5 text-[#E0B13C]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-[#E0B13C]">Capítulo 5</span>
              <span className="h-px w-12 bg-[#E0B13C]/40" />
            </Reveal>
            <Reveal variant="up" delay={120} as="h2" className="font-display text-3xl md:text-5xl font-bold text-white text-center leading-tight mb-10">
              Hoje, sob o cuidado de <span className="text-[#E0B13C]">Uirá</span>
            </Reveal>

            <Reveal variant="fade" delay={240} className="prose-elegant prose-dark max-w-3xl mx-auto">
              <p>
                A Fazenda Vagafogo segue firme em sua busca pela <strong>sustentabilidade</strong>, com o melhor aproveitamento possível das frutas orgânicas do cerrado e da produção de leite, resultando em cerca de <strong className="text-[#E0B13C]">70 itens comercializados</strong>.
              </p>
              <p>
                Um dos grandes destaques é o <strong>brunch sustentável</strong>, que reúne esses produtos em uma experiência gastronômica única — valorizando ingredientes locais e sazonais, preparados com responsabilidade ambiental.
              </p>
              <p>
                Atualmente, é <strong className="text-[#E0B13C]">Uirá</strong> quem está à frente da Vagafogo, dando continuidade ao legado dos pais com dedicação e visão de futuro. E a história segue: seus filhos, <strong className="text-[#E0B13C]">Rudah, Eloah e Mariah</strong>, já participam ativamente do dia a dia da fazenda.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-12">
              {[
                { nome: "Rudah", papel: "Próxima geração" },
                { nome: "Eloah", papel: "Próxima geração" },
                { nome: "Mariah", papel: "Próxima geração" },
              ].map((pessoa, i) => (
                <Reveal key={pessoa.nome} variant="up" delay={300 + i * 100}>
                  <Spotlight color="rgba(224, 177, 60, 0.2)" className="rounded-2xl">
                    <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/[0.08] hover:border-[#E0B13C]/30 group">
                      <div className="w-14 h-14 rounded-full bg-[#E0B13C]/20 border border-[#E0B13C]/40 flex items-center justify-center mx-auto mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                        <FaSeedling className="w-6 h-6 text-[#E0B13C]" />
                      </div>
                      <p className="font-display font-bold text-white text-xl">{pessoa.nome}</p>
                      <p className="text-xs text-[#E0B13C] uppercase tracking-widest mt-1">{pessoa.papel}</p>
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
                  <img src={brunchImg} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/70" />
                </div>

                <div className="relative z-10 max-w-2xl">
                  <Reveal variant="up" delay={150}>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#8B4F23] mb-3">Faça parte da história</span>
                  </Reveal>
                  <Reveal variant="up" delay={250} as="h2" className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-[#2D1E0F] leading-[1.1] tracking-tight">
                    Viva a Vagafogo<br />
                    <span className="text-[#8B4F23]">por você mesmo</span>
                  </Reveal>
                  <Reveal variant="up" delay={350} as="p" className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed">
                    Reserve sua visita e experimente em pessoa esse projeto de vida construído com amor pela terra.
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
                      to="/"
                      className="inline-flex items-center justify-center gap-2 border border-[#8B4F23]/20 bg-white text-[#8B4F23] font-medium px-8 py-4 rounded-full hover:bg-[#8B4F23]/5 hover:border-[#8B4F23]/40 transition-all duration-300 text-sm whitespace-nowrap"
                    >
                      Voltar ao início
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
