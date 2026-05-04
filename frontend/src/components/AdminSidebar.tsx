import { useState } from 'react';
import { FaCalendarAlt, FaSignOutAlt, FaChartBar, FaEnvelope, FaWhatsapp } from 'react-icons/fa';
import logo from '../assets/logo.jpg';

const navItems = [
  { id: 'reservas', icon: FaCalendarAlt, label: 'Reservas', description: 'Gestão de agenda' },
  { id: 'dashboard', icon: FaChartBar, label: 'Relatórios', description: 'Métricas e resultados' },
  { id: 'email', icon: FaEnvelope, label: 'Email', description: 'Comunicacao' },
  { id: 'whatsapp', icon: FaWhatsapp, label: 'WhatsApp', description: 'Modelos' },
];

export function AdminSidebar() {
  const [active, setActive] = useState('reservas');

  return (
    <aside className="w-64 hidden md:flex flex-col fixed h-screen shadow-2xl z-40" style={{ background: "linear-gradient(180deg, #1a1008 0%, #2D1E0F 60%, #3d2810 100%)" }}>
      {/* Divisor top accent */}
      <div className="h-0.5 w-full bg-gradient-to-r from-[#8B4F23] via-[#E0B13C] to-[#8B4F23]" />

      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Logo Vagafogo"
            className="w-10 h-10 rounded-xl object-cover border border-white/20 shadow"
          />
          <div>
            <p className="font-bold text-white text-sm tracking-wide">VAGAFOGO</p>
            <p className="text-[10px] text-amber-400/80 uppercase tracking-widest">Painel Admin</p>
          </div>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-3 mb-3">Menu</p>
        {navItems.map(({ id, icon: Icon, label, description }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${
                isActive
                  ? 'bg-[#8B4F23] text-white shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/8'
              }`}
            >
              <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10'
              }`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-none">{label}</span>
                <span className="block text-xs mt-0.5 opacity-60 leading-none">{description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Rodapé */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#8B4F23] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            A
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-semibold truncate">Administrador</p>
            <p className="text-white/40 text-[10px] truncate">admin@vagafogo.com</p>
          </div>
        </div>
        <button className="w-full flex items-center justify-center gap-2 py-2 bg-white/8 hover:bg-white/15 rounded-lg text-white/60 hover:text-white text-xs font-medium transition-all duration-200">
          <FaSignOutAlt className="w-3.5 h-3.5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
