type OpenAgendaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function OpenAgendaModal({ isOpen, onClose, onConfirm }: OpenAgendaModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Abrir Agenda</h3>
        {/* Conteúdo do modal */}
        {/* ... seus inputs e checkboxes */}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
