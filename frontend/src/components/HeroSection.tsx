import heroImg from '../assets/hero/hero-1.jpg'
export function HeroSection() {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center justify-center pt-20 md:pt-0"
       style={{
        backgroundImage: `linear-gradient(rgba(45,30,15,0.7), rgba(45,30,15,0.7)), url(${heroImg})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black/40" /> {/* Extra overlay, opcional */}
      <div className="relative z-10 container mx-auto px-4 py-16 md:py-0 flex flex-col items-center">
        <div className="max-w-2xl w-full text-center px-4">
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg">
            Descubra o Santuário Vagafogo
          </h1>
          <p className="text-lg md:text-xl text-white mb-8 drop-shadow">
            Uma experiência gastronômica única, aliada às maravilhas do cerrado brasileiro. Sabores que emocionam com uma natureza que encanta.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="#reservas"
              className="flex items-center bg-yellow-600 text-white font-semibold px-8 py-4 rounded-full shadow hover:bg-yellow-700 transition duration-300 text-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Faça sua reserva
            </a>
            <a
              href="#brunch"
              className="flex items-center border-2 border-white text-white font-semibold px-8 py-4 rounded-full hover:bg-white hover:text-yellow-700 transition duration-300 text-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
              </svg>
              Saiba mais
            </a>
          </div>
        </div>

        {/* Seta de rolagem */}
       
      </div>
    </section>
  )
}
