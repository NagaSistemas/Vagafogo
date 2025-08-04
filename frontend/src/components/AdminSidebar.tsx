import { useState } from 'react';
import { FaCalendarAlt, FaSignOutAlt } from 'react-icons/fa';

export function AdminSidebar() {
  const [active, setActive] = useState('agenda');

  return (
    <aside className="w-64 bg-gray-800 text-white hidden md:flex flex-col fixed h-screen justify-between shadow-xl">
      {/* Topo: Logo e Navegação */}
      <div>
        {/* Logo */}
        <div className="p-4 border-b border-gray-700 flex flex-col items-center">
          <img
            src="/logo.jpg"
            alt="Logo"
            className="w-20 h-20 rounded-2xl object-cover border border-gray-400"
          />
        </div>
        {/* Navegação */}
        <nav className="mt-6">
          <button
            onClick={() => setActive('agenda')}
            className={`flex items-center gap-3 px-8 py-3 w-full text-left font-medium transition rounded-lg
              ${active === 'agenda' ? 'bg-gray-900 text-blue-400' : 'hover:bg-gray-700'}
            `}
          >
            <FaCalendarAlt className="text-xl" />
            <span className="text-base">Agenda</span>
          </button>
        </nav>
      </div>

      {/* Rodapé: Usuário e Sair */}
      <div className="w-full">
        <div className="p-6 border-t border-gray-700 flex flex-col items-center">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-xl font-bold mb-2">
            A
          </div>
          {/* Info usuário */}
          <div className="text-center mb-2">
            <p className="font-semibold text-white">Administrador</p>
            <p className="text-sm text-gray-400">admin@vagafogo.com</p>
          </div>
          {/* Botão Sair */}
          <button className="mt-2 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center gap-2 text-white font-medium transition">
            <FaSignOutAlt className="text-lg" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
