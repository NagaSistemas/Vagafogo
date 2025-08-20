import { db } from '../../firebase'; // seu arquivo de config firebase do frontend!
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';

// Criar pacote
export const createPacote = async (pacote: any) => {
  const ref = await addDoc(collection(db, 'pacotes'), pacote);
  return ref.id;
};

// Listar pacotes
export const getPacotes = async () => {
  const snap = await getDocs(collection(db, 'pacotes'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Atualizar pacote
export const updatePacote = async (id: string, pacote: any) => {
  await updateDoc(doc(db, 'pacotes', id), pacote);
};

// Deletar pacote
export const deletePacote = async (id: string) => {
  await deleteDoc(doc(db, 'pacotes', id));
};
