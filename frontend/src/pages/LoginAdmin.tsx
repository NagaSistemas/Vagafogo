import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import logo from "../assets/logo.jpg";

export function LoginAdmin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!email || !password) {
      setErro("Por favor, preencha todos os campos.");
      return;
    }
    setLoading(true);
    
    // Login temporário que funciona apenas uma vez
    if (email === "temp@admin.com" && password === "temp123") {
      const used = localStorage.getItem("tempLoginUsed");
      if (used) {
        setErro("Login temporário já foi utilizado!");
        setLoading(false);
        return;
      }
      localStorage.setItem("tempLoginUsed", "true");
      localStorage.setItem("tempAuth", "authenticated");
      navigate("/admin");
      setLoading(false);
      return;
    }
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/admin");
    } catch (error: any) {
      setErro("Usuário ou senha inválidos!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-4xl w-full flex flex-col md:flex-row rounded-2xl overflow-hidden shadow-2xl">

        {/* Painel esquerdo com branding */}
        <div className="w-full md:w-2/5 bg-black text-white flex flex-col items-center justify-center p-8 text-center pattern-bg">
          <div className="mb-8">
            <img
              src={logo}
              alt="Santuário Vagafogo"
              className="w-32 h-32 mx-auto mb-4 rounded-full object-cover"
            />
            <h1 className="font-serif text-3xl font-bold mb-2">Santuário Vagafogo</h1>
            <p className="text-gray-300">Painel Administrativo</p>
          </div>
        </div>

        {/* Formulário de login */}
        <div className="w-full md:w-3/5 bg-white p-8 md:p-12">
          <h2 className="text-3xl font-bold mb-2 text-center md:text-left">Acesso Restrito</h2>
          <p className="text-gray-600 mb-8 text-center md:text-left">Credenciais de administrador</p>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {erro && (
              <div className="text-red-600 font-semibold text-center">{erro}</div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Usuário administrador</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-user text-gray-400" />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B4513] focus:border-[#8B4513] transition duration-300"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-lock text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B4513] focus:border-[#8B4513] transition duration-300"
                  autoComplete="current-password"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Toggle password visibility"
                  >
                    <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className={`w-full bg-[#8B4513] hover:bg-[#6b2d0c] text-white py-3 px-4 rounded-lg font-medium transition duration-300 flex items-center justify-center ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={loading}
              >
                <i className="fas fa-sign-in-alt mr-2" />
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
