
type PixModalProps = {
  visible: boolean;
  onClose: () => void;
  qrCodeImage?: string;
  pixPayload?: string;
};

export const PixModal = ({ visible, onClose, qrCodeImage, pixPayload }: PixModalProps) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 w-full max-w-md text-center shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-[#8B4F23]">Escaneie o QR Code para pagar</h2>

        {qrCodeImage ? (
          <img src={qrCodeImage} alt="QR Code Pix" className="mx-auto mb-4 w-64 h-64" />
        ) : (
          <p className="text-sm text-gray-500">Carregando QR Code...</p>
        )}

        {pixPayload && (
          <div className="mt-2 text-xs bg-gray-100 p-2 rounded text-gray-600">
            <p className="mb-1">Ou copie e cole:</p>
            <textarea
              readOnly
              value={pixPayload}
              className="w-full text-xs bg-gray-50 p-2 rounded border border-gray-300"
              rows={3}
            />
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 bg-[#8B4F23] text-white px-6 py-2 rounded-full hover:bg-[#a06230] transition"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
