import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

export interface ConfigSite {
  textoFuncionamento?: string;
}

let _cache: ConfigSite | null = null;
let _promise: Promise<ConfigSite> | null = null;

async function carregarConfigSite(): Promise<ConfigSite> {
  if (_cache !== null) return _cache;
  if (!_promise) {
    _promise = getDoc(doc(db, "configuracoes", "site")).then((snap) => {
      _cache = snap.exists() ? (snap.data() as ConfigSite) : {};
      return _cache;
    }).catch(() => {
      _promise = null;
      return {};
    });
  }
  return _promise;
}

export function invalidarCacheConfigSite() {
  _cache = null;
  _promise = null;
}

export function useConfigSite() {
  const [config, setConfig] = useState<ConfigSite>(_cache ?? {});
  const [carregando, setCarregando] = useState(_cache === null);

  useEffect(() => {
    if (_cache !== null) return;
    carregarConfigSite().then((c) => {
      setConfig(c);
      setCarregando(false);
    });
  }, []);

  return { config, carregando };
}
