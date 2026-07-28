"use client";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Modalidade = "servicos_gerais" | "informatica";

interface ModalidadeContextType {
  modalidade: Modalidade;
  setModalidade: (m: Modalidade) => void;
}

const ModalidadeContext = createContext<ModalidadeContextType>({
  modalidade: "servicos_gerais",
  setModalidade: () => {},
});

const STORAGE_KEY = "pmesp.modalidade";

export function ModalidadeProvider({ children }: { children: ReactNode }) {
  const [modalidade, setModalidadeState] = useState<Modalidade>("servicos_gerais");

  // Carrega do localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "informatica" || saved === "servicos_gerais") {
      setModalidadeState(saved);
    }
  }, []);

  const setModalidade = (m: Modalidade) => {
    setModalidadeState(m);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, m);
    }
  };

  return (
    <ModalidadeContext.Provider value={{ modalidade, setModalidade }}>
      {children}
    </ModalidadeContext.Provider>
  );
}

export const useModalidade = () => useContext(ModalidadeContext);

export const MODALIDADES = [
  { value: "servicos_gerais" as Modalidade, label: "🛠 Serviços Gerais", cor: "#003882" },
  { value: "informatica" as Modalidade, label: "💻 Informática", cor: "#7c3aed" },
];
