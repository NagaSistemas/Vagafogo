import Header from "../components/Header.tsx"
import { HeroSection } from "../components/HeroSection.tsx"
import { FeatureSection } from "../components/FeatureSection.tsx"
import { BrunchSection } from "../components/BrunchSection.tsx"
import { TrailSection } from "../components/TrailSection.tsx"
import { EducationSection } from "../components/EducationSection.tsx"
import { Footer } from "../components/Footer.tsx"
import { FloatingButtons } from "../components/FloatingButtons.tsx"
import { Reveal } from "../components/Reveal.tsx"
import { IntroVideo } from "../components/IntroVideo.tsx"
import { Magnetic } from "../components/Magnetic.tsx"
import { Link } from "react-router-dom"

export function Home() {
  return (
    <>
      <IntroVideo />
      <Header />
      <FloatingButtons />
      <main>
        <HeroSection />
        <FeatureSection />
        <BrunchSection />
        <TrailSection />
        <EducationSection />

        {/* CTA Section */}
        <section className="py-20 md:py-24 bg-[#F1F4E5]">
          <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <Reveal variant="scale" className="block">
            <div className="relative rounded-[28px] overflow-hidden bg-gradient-to-br from-[#2D1E0F] via-[#3a2715] to-[#1a120a] px-8 py-14 md:px-16 md:py-20 shadow-2xl border border-[#E0B13C]/10">
              {/* Decorativos */}
              <div className="pointer-events-none absolute top-0 right-0 w-96 h-96 rounded-full opacity-15 -translate-y-1/2 translate-x-1/3 bg-[#E0B13C] blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-15 translate-y-1/2 -translate-x-1/3 bg-[#8B4F23] blur-3xl" />

              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="text-center md:text-left max-w-xl">
                  <Reveal variant="up" delay={150}>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-[0.32em] text-[#E0B13C] mb-3">Reservas abertas</span>
                  </Reveal>
                  <Reveal variant="up" delay={250} as="h2" className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1] tracking-tight">
                    Faça sua reserva em <br className="hidden md:block" />
                    <span className="text-[#E0B13C]">poucos passos</span>
                  </Reveal>
                  <Reveal variant="up" delay={350} as="p" className="mt-4 text-gray-300 text-sm md:text-base leading-relaxed">
                    Escolha o pacote, selecione a data e horário, e finalize o pagamento de forma simples e segura.
                  </Reveal>
                </div>

                <Reveal variant="right" delay={400} className="flex flex-col sm:flex-row gap-3 w-full md:w-auto md:flex-shrink-0">
                  <Magnetic strength={0.2} className="w-full sm:w-auto">
                  <Link
                    to="/reservar"
                    className="btn-glow group inline-flex items-center justify-center gap-2 bg-[#8B4F23] text-white font-semibold px-8 py-4 rounded-full shadow-xl hover:bg-[#A05D2B] transition-all duration-300 hover:shadow-2xl text-sm whitespace-nowrap w-full"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Reservar Agora
                    <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  </Magnetic>
                  <Magnetic strength={0.2} className="w-full sm:w-auto">
                  <a
                    href="https://wa.me/5562992225471"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 backdrop-blur-sm text-white font-medium px-8 py-4 rounded-full hover:bg-white/10 hover:border-white/40 transition-all duration-300 text-sm whitespace-nowrap w-full"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.01 2C6.48 2 2 6.477 2 12.006c0 1.937.512 3.775 1.482 5.39L2.04 22l4.716-1.248A9.949 9.949 0 0 0 12.01 22c5.523 0 10.01-4.478 10.01-9.994C22.02 6.478 17.533 2 12.01 2zm5.236 14.395c-.242.683-1.406 1.35-1.924 1.38-.517.03-1.013.255-2.826-.607-2.38-.99-3.904-3.408-4.024-3.568-.12-.16-.96-1.277-.96-2.436s.608-1.728.824-1.963c.217-.234.48-.293.64-.293s.32-.005.459.007c.144.012.337-.055.528.407.192.462.652 1.595.711 1.71.06.115.096.257.018.413-.08.157-.12.256-.238.394-.12.138-.252.306-.36.412-.12.117-.243.244-.105.478.137.233.607 1.003 1.305 1.625.897.803 1.656 1.05 1.89 1.17.235.12.373.103.509-.06.136-.164.58-.675.734-.908.154-.232.308-.194.519-.117.211.076 1.335.63 1.565.744.23.115.384.17.442.266.06.096.06.554-.183 1.237z" />
                    </svg>
                    Falar no WhatsApp
                  </a>
                  </Magnetic>
                </Reveal>
              </div>
            </div>
            </Reveal>
          </div>
        </section>

        <Footer />
      </main>
    </>
  )
}
