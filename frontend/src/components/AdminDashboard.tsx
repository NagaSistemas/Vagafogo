import { useEffect, useState } from 'react';
import React from 'react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { FaChevronLeft, FaChevronRight, FaTrash, FaEdit, FaPlus, FaWhatsapp } from 'react-icons/fa';

import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat);
dayjs.locale('pt-br');

interface Reserva {
  id?: string;
  nome: string;
  cpf: string;
  telefone: string;
  participantes: number;
  adultos?: number;
  criancas?: number; // Criança de 5 a 12 anos
  naoPagante?: number; // Criança até 4 anos
  bariatrica?: number;
  data: string;
  horario: string;
  atividade: string;
  valor?: number;
  status?: string;
}


export default function AdminDashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [reservas, setReservas] = useState<Record<string, Reserva[]>>({});
  const [editReserva, setEditReserva] = useState<Reserva | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [filtroAtividade, setFiltroAtividade] = useState<string>(''); // Novo filtro

  const fetchReservas = async (date: Date) => {
    const formatted = dayjs(date).format('YYYY-MM-DD');
    try {
      const q = query(collection(db, 'reservas'), where('data', '==', formatted));
      const snapshot = await getDocs(q);
      const dados: Reserva[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reserva));

      const reservasPagas = dados.filter(r => r.status === 'pago');

      const reservasPorHorario = reservasPagas.reduce((acc, reserva) => {
        const horario = reserva.horario || 'Não especificado';
        if (!acc[horario]) {
          acc[horario] = [];
        }
        acc[horario].push(reserva);
        return acc;
      }, {} as Record<string, Reserva[]>);

      setReservas(reservasPorHorario);
    } catch (error) {
      console.error("Erro ao buscar reservas:", error);
      setReservas({});
    }
  };

  useEffect(() => {
    fetchReservas(selectedDate);
  }, [selectedDate]);

  const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = daysInMonth(currentMonth, currentYear);
  const days: (number | null)[] = Array(firstDayOfMonth).fill(null).concat([...Array(totalDays).keys()].map(i => i + 1));

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentYear, currentMonth + offset);
    setCurrentMonth(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
  };

  const excluirReserva = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta reserva?")) {
      try {
        await deleteDoc(doc(db, "reservas", id));
        fetchReservas(selectedDate);
      } catch (error) {
        console.error("Erro ao excluir reserva:", error);
      }
    }
  };

  const handleEdit = (reserva: Reserva) => {
    setEditReserva(reserva);
    setIsEditing(true);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setEditReserva({
      nome: '',
      cpf: '',
      telefone: '',
      participantes: 1,
      data: dayjs(selectedDate).format('YYYY-MM-DD'),
      horario: '',
      atividade: ''
    });
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!editReserva) return;
    try {
      if (isEditing && editReserva.id) {
        const ref = doc(db, "reservas", editReserva.id);
        await updateDoc(ref, {
          nome: editReserva.nome,
          cpf: editReserva.cpf,
          telefone: editReserva.telefone,
          participantes: editReserva.participantes,
          adulto: editReserva.adultos ?? 0,
          crianca: editReserva.criancas ?? 0,
          naoPagante: editReserva.naoPagante ?? 0,
          bariatrica: editReserva.bariatrica ?? 0,
          horario: editReserva.horario,
          atividade: editReserva.atividade,
        });
      } else {
        await addDoc(collection(db, "reservas"), editReserva);
      }
      setModalVisible(false);
      setEditReserva(null);
      fetchReservas(selectedDate);
    } catch (error) {
      console.error("Erro ao salvar reserva:", error);
    }
  };

  return (
    <main className="pt-2 pb-4 px-4 md:ml-64">
      <section className="bg-white p-4 rounded shadow">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => changeMonth(-1)}><FaChevronLeft /></button>
          <h2 className="text-lg font-bold">{dayjs(new Date(currentYear, currentMonth)).format('MMMM [de] YYYY')}</h2>
          <button onClick={() => changeMonth(1)}><FaChevronRight /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dia => (
            <div key={dia} className="text-center font-semibold text-gray-600 text-sm">{dia}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isSelected = day && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
            return (
              <div
                key={idx}
                className={`text-center p-2 rounded cursor-pointer transition-all h-12 flex items-center justify-center text-sm font-medium ${day ? (isSelected ? 'bg-green-600 text-white' : 'bg-green-100 hover:bg-green-200') : ''}`}
                onClick={() => day && setSelectedDate(new Date(currentYear, currentMonth, day))}
              >
                {day || ''}
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white p-4 mt-6 rounded shadow">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-lg font-bold">
              Agendamentos para: {dayjs(selectedDate).format('DD/MM/YYYY')}
            </h3>
            <select
              value={filtroAtividade}
              onChange={(e) => setFiltroAtividade(e.target.value)}
              className="border px-3 py-1 rounded text-sm"
            >
              <option value="">Todas Atividades</option>
              <option value="Trilha Ecológica">Trilha Ecológica</option>
              <option value="Brunch Gastronômico">Brunch Gastronômico</option>
              <option value="Brunch + trilha">Brunch + trilha</option>
            </select>
          </div>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
            <FaPlus /> Nova Reserva
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Reservista</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">CPF</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Telefone</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Participantes</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Adultos</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">criança</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Não Pagante</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Bariatrica</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Atividade</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Horário</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Status</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Valor</th>
                <th className="px-4 py-2 text-sm font-medium text-left text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
  {Object.keys(reservas).length === 0 ? (
    <tr>
      <td colSpan={13} className="px-4 py-3 text-gray-500 text-sm">Nenhuma reserva paga encontrada.</td>
    </tr>
  ) : (
    // Define a ordem dos horários
    ['09:00', '11:00', '13:00']
      .filter(horario => reservas[horario]) // ignora os que não existem
      .map(horario => {
        const reservasPorHorario = reservas[horario];
        const filtradas = reservasPorHorario.filter(r =>
          !filtroAtividade || r.atividade === filtroAtividade
        );
        if (filtradas.length === 0) return null;
        return (
          <React.Fragment key={horario}>
            <tr>
              <td colSpan={13} className="font-bold bg-gray-100 text-gray-700 px-4 py-2">{horario}</td>
            </tr>
            {filtradas.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 text-sm">{r.nome}</td>
                <td className="px-4 py-2 text-sm">{r.cpf}</td>
                <td className="px-4 py-2 text-sm">{r.telefone}</td>
                <td className="px-4 py-2 text-sm">{r.participantes}</td>
                <td className="px-4 py-2 text-sm">{r.adultos ?? 0}</td>
                <td className="px-4 py-2 text-sm">{r.criancas ?? 0}</td>
                <td className="px-4 py-2 text-sm">{r.naoPagante ?? 0}</td>
                <td className="px-4 py-2 text-sm">{r.bariatrica ?? 0}</td>
                <td className="px-4 py-2 text-sm">{r.atividade}</td>
                <td className="px-4 py-2 text-sm">{r.horario}</td>
                <td className="px-4 py-2 text-sm capitalize">{r.status || '-'}</td>
                <td className="px-4 py-2 text-sm">
                  {r.valor !== undefined
                    ? r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '-'}
                </td>
                <td className="px-4 py-2 text-sm flex gap-2">
                  <a
                    href={`https://wa.me/55${r.telefone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 text-xs hover:underline"
                  >
                    <FaWhatsapp />
                  </a>
                  <button
                    onClick={() => handleEdit(r)}
                    className="text-blue-600 text-xs hover:underline flex items-center gap-1"
                  >
                    <FaEdit /> Editar
                  </button>
                  <button
                    onClick={() => excluirReserva(r.id!)}
                    className="text-red-600 text-xs hover:underline flex items-center gap-1"
                  >
                    <FaTrash /> Excluir
                  </button>
                </td>
              </tr>
            ))}
          </React.Fragment>
        );
      })
  )}
</tbody>

          </table>
        </div>

        {/* Modal */}
        {modalVisible && editReserva && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded shadow w-full max-w-md">
              <h4 className="text-lg font-bold mb-4">{isEditing ? 'Editar' : 'Nova'} Reserva</h4>
              <label className="block mb-2 text-sm">Nome:
                <input
                  type="text"
                  value={editReserva.nome}
                  onChange={e => setEditReserva({ ...editReserva, nome: e.target.value })}
                  className="w-full border px-3 py-2 rounded mt-1"
                />
              </label>
              <label className="block mb-2 text-sm">CPF:
                <input
                  type="text"
                  value={editReserva.cpf}
                  onChange={e => setEditReserva({ ...editReserva, cpf: e.target.value })}
                  className="w-full border px-3 py-2 rounded mt-1"
                />
              </label>
              <label className="block mb-2 text-sm">Telefone:
                <input
                  type="text"
                  value={editReserva.telefone}
                  onChange={e => setEditReserva({ ...editReserva, telefone: e.target.value })}
                  className="w-full border px-3 py-2 rounded mt-1"
                />
              </label>
              <label className="block mb-2 text-sm">Participantes:
                <input
                  type="number"
                  value={editReserva.participantes}
                  onChange={e => setEditReserva({ ...editReserva, participantes: Number(e.target.value) })}
                  className="w-full border px-3 py-2 rounded mt-1"
                />
              </label>
              <label className="block mb-2 text-sm">Horário:
                <input
                  type="time"
                  value={editReserva.horario}
                  onChange={e => setEditReserva({ ...editReserva, horario: e.target.value })}
                  className="w-full border px-3 py-2 rounded mt-1"
                />
              </label>
              <label className="block mb-2 text-sm">Atividade:
                <select
                  value={editReserva.atividade}
                  onChange={e => setEditReserva({ ...editReserva, atividade: e.target.value })}
                  className="w-full border px-3 py-2 rounded mt-1"
                >
                  <option value="">Todas Atividades</option>
                  <option value="Trilha Ecológica">Trilha Ecológica</option>
                  <option value="Brunch Gastronômico">Brunch Gastronômico</option>
                  <option value="Brunch + trilha">Brunch + trilha</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setModalVisible(false)} className="px-4 py-2 bg-gray-400 text-white rounded">Cancelar</button>
                <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded">Salvar</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
