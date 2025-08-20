import { Navigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../../firebase";
import type { ReactNode } from "react"; // <-- CORREÇÃO AQUI

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [user, loading] = useAuthState(auth);
  const tempAuth = localStorage.getItem("tempAuth");

  if (loading) return <div>Carregando...</div>;
  if (!user && !tempAuth) return <Navigate to="/login" />;
  return <>{children}</>;
}
