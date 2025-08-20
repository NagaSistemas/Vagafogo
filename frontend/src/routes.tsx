import { createBrowserRouter } from "react-router-dom"
import { Home } from "./pages/home"
import { LoginAdmin } from "./pages/LoginAdmin"
import { Admin } from "./pages/Admin"
import { ProtectedRoute } from "./components/ProtectedRoute"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />
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
