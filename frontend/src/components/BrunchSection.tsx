import BrunchImg from '../assets/hero/hero-2.jpg'
import laticImg1 from '../assets/brunch/laticinios/brunch-1.jpg'
import laticImg2 from '../assets/brunch/laticinios/brunch-2.jpg'
import laticImg3 from '../assets/brunch/laticinios/brunch-3.jpg'
export function BrunchSection() {
  return (
    <section
      id="brunch"
      className="py-16 md:py-24"
      style={{
        backgroundImage: `linear-gradient(rgba(45, 30, 15, 0.7), rgba(45, 30, 15, 0.7)), url(${BrunchImg})`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }}
    >
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <span className="text-white font-semibold uppercase tracking-wider">
            DESCUBRA A GASTRONOMIA
          </span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-white mt-2 mb-4 drop-shadow-lg">
            Brunch Vagafogo
          </h2>
          <p className="text-gray-200 text-lg">
            Um maravilhoso festival gastronômico com derivados do leite produzido na fazenda e frutas do cerrado cultivadas no local, proveniente de manejo sustentável.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Laticínios */}
          <div className="bg-white/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
            <div className="relative h-64">
              <div className="h-full w-full bg-cover bg-center" style={{backgroundImage: `url(${laticImg1})`}} ></div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <h3 className="font-heading text-xl font-bold text-white drop-shadow">Laticínios Artesanais</h3>
              </div>
            </div>
          </div>

          {/* Frutas do Cerrado */}
          <div className="bg-white/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
            <div className="relative h-64">
              <div className="h-full w-full bg-cover bg-center" style={{backgroundImage: `url(${laticImg2})`}}></div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <h3 className="font-heading text-xl font-bold text-white drop-shadow">Frutas do Cerrado</h3>
              </div>
            </div>
          </div>

          {/* Harmonizações Exclusivas */}
          <div className="bg-white/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
            <div className="relative h-64">
              <div className="h-full w-full bg-cover bg-center" style={{backgroundImage: `url(${laticImg3})`}}></div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <h3 className="font-heading text-xl font-bold text-white drop-shadow">Harmonizações Exclusivas</h3>
              </div>
            </div>
          </div>
        </div>

        {/* Pontinhos de navegação fake, igual ao print */}
        <div className="flex gap-2 justify-center mt-4">
          <span className="w-2 h-2 bg-white rounded-full inline-block opacity-80"></span>
          <span className="w-2 h-2 bg-white/60 rounded-full inline-block opacity-80"></span>
          <span className="w-2 h-2 bg-white/60 rounded-full inline-block opacity-80"></span>
        </div>

        {/* Botão final */}
        <div className="text-center mt-12 px-4">
  <a
    href="#reservas"
    className="bg-[#8B4F23] text-white font-semibold px-6 py-3 sm:px-8 sm:py-4 rounded-full shadow-lg hover:bg-[#A05D2B] text-base sm:text-lg transition duration-300 focus:ring-2 focus:ring-offset-2 focus:ring-[#8B4F23] inline-block w-full sm:w-auto max-w-md"
  >
    <i className="fas fa-bookmark mr-2"></i> Reservar Experiência Gastronômica
  </a>
</div>

      </div>
     </section>
  );
}
