import { createBrowserRouter } from "react-router-dom"
import { Home } from "./pages/home"
import { LoginAdmin } from "./pages/LoginAdmin"
import { Admin } from "./pages/Admin"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { Reserva } from "./pages/Reserva"
import { MinhaReserva } from "./pages/MinhaReserva"
import { Historia } from "./pages/Historia"
import { HistoriaPirenopolis } from "./pages/HistoriaPirenopolis"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />
  },
  {
    path: "/historia",
    element: <Historia />
  },
  {
    path: "/historia/pirenopolis",
    element: <HistoriaPirenopolis />
  },
  {
    path: "/reservar",
    element: <Reserva />
  },
  {
    path: "/minha-reserva",
    element: <MinhaReserva />
  },
  {
    path: "/login",
    element: <LoginAdmin />
  },
   {
    path: "/admin",
    element:  <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
  }
])
