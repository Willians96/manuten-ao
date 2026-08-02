// src/lib/extra.ts - Helper pra detectar "Acionado emergencialmente na folga"
// Funcao pura: recebe dados, retorna { isExtra, label, motivo }
// Usada em /tecnico (cards), /gestor/relatorios (filtros + coluna), /gestor (dashboard)

export type ExtraInfo = {
  isExtra: boolean;
  label: string; // "" se nao for extra
  motivo: string; // explicacao do motivo (sab/dom/feriado/fora horario/folga)
};

// Feriados nacionais BR 2026 + 2027 (fallback caso nao tenha cadastrado no banco)
const FERIADOS_NACIONAIS_FALLBACK = new Set([
  // 2026
  "2026-01-01", // Confraternizacao Universal
  "2026-04-03", // Paixao de Cristo (sexta)
  "2026-04-21", // Tiradentes
  "2026-05-01", // Dia do Trabalho
  "2026-09-07", // Independencia
  "2026-10-12", // N. Sra. Aparecida
  "2026-11-02", // Finados
  "2026-11-15", // Proclamacao da Republica
  "2026-11-20", // Consciencia Negra
  "2026-12-25", // Natal
  // 2027
  "2027-01-01",
  "2027-03-26", // Paixao de Cristo
  "2027-04-21",
  "2027-05-01",
  "2027-09-07",
  "2027-10-12",
  "2027-11-02",
  "2027-11-15",
  "2027-11-20",
  "2027-12-25",
]);

// Converte "2026-07-29T12:58" ou "2026-07-29" pra { dataStr: "2026-07-29", hora: 12, min: 58 }
// IMPORTANTE: usa new Date(s).getHours() que converte UTC->local automaticamente
// Assim "2026-07-30T13:54:15.154Z" vira 10:54 BRT (correto)
function parseDataHora(s: string | undefined): { dataStr: string; hora: number; min: number; dow: number } | null {
  if (!s) return null;
  // Tenta ISO com T
  const m1 = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (m1) {
    // Cria Date com a string inteira (que pode ter Z ou não) e extrai hora/min LOCAL
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return {
        dataStr: m1[1],
        hora: d.getHours(),
        min: d.getMinutes(),
        dow: d.getDay(),
      };
    }
  }
  // Tenta só data
  const m2 = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m2) {
    const d = new Date(s + "T12:00:00"); // meio-dia pra evitar TZ bug
    if (!isNaN(d.getTime())) {
      return {
        dataStr: m2[1],
        hora: d.getHours(),
        min: d.getMinutes(),
        dow: d.getDay(),
      };
    }
  }
  return null;
}

// Formata HH:MM
function fmtHora(hora: number, min: number): string {
  return String(hora).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

// Verifica se uma data/hora cai dentro de um periodo do expediente
// TI: seg-sex, 08:00-12:00 e 14:00-18:00
// SG: 07:00-19:00 (qualquer dia)
function isDentroExpedienteTI(dow: number, hora: number, min: number): boolean {
  // dow: 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
  if (dow === 0 || dow === 6) return false; // sab/dom
  const minutos = hora * 60 + min;
  // 08:00-12:00
  if (minutos >= 8 * 60 && minutos <= 12 * 60) return true;
  // 14:00-18:00
  if (minutos >= 14 * 60 && minutos <= 18 * 60) return true;
  return false;
}

function isDentroExpedienteSG(_dow: number, hora: number, min: number): boolean {
  // SG: 07:00-19:00 todo dia
  const minutos = hora * 60 + min;
  return minutos >= 7 * 60 && minutos <= 19 * 60;
}

export type ExtraArgs = {
  servico: {
    dataInicioExec?: string;
    dataFimExec?: string;
    tecnicoId?: string;
    equipeId?: string;
  };
  tecnico?: {
    modalidades?: string[]; // ["informatica"] ou ["servicos_gerais"]
    status?: string; // "ativo" | "ferias" | "baixa" | "folga"
    statusDesde?: number;
  } | null;
  equipe?: {
    modalidade?: string;
  } | null;
  // Lista de datas (YYYY-MM-DD) que sao feriados - vem do banco
  feriados?: string[];
  // Lista de folgas retroativas do tecnico (userId, data) - do banco
  folgasRetroativas?: { data: string; motivo: string }[];
};

export function ehChamadoExtra(args: ExtraArgs): ExtraInfo {
  const { servico, tecnico, equipe, feriados = [] } = args;

  // Sem tecnico/equipe, nao da pra calcular - considera normal
  if (!tecnico) return { isExtra: false, label: "", motivo: "" };

  const ini = parseDataHora(servico.dataInicioExec);
  const fim = parseDataHora(servico.dataFimExec);

  // Se nao tem dataInicioExec, nao da pra classificar
  if (!ini) return { isExtra: false, label: "", motivo: "Sem data de inicio registrada" };

  const dow = ini.dow;
  const dataStr = ini.dataStr;

  // Combina feriados do banco com fallback
  const feriadosSet = new Set<string>([...feriados, ...FERIADOS_NACIONAIS_FALLBACK]);
  const ehFeriado = feriadosSet.has(dataStr);

  // Determina se e TI ou SG
  const mods = (tecnico.modalidades && tecnico.modalidades.length > 0) ? tecnico.modalidades : ["servicos_gerais"];
  // Se modalidades inclui "informatica" -> TI; senao -> SG
  const ehTI = mods.includes("informatica");
  const dentroExpediente = ehTI
    ? isDentroExpedienteTI(dow, ini.hora, ini.min)
    : isDentroExpedienteSG(dow, ini.hora, ini.min);

  // Caso 1: Tecnico em folga (ferias/baixa) E servico no mesmo dia
  // => "Acionado emergencialmente na folga"
  // Caso 1a: Folga retroativa cadastrada para o tecnico NESTA data
  if (args.folgasRetroativas && args.folgasRetroativas.length > 0) {
    const folga = args.folgasRetroativas.find((f: any) => f.data === dataStr);
    if (folga) {
      let motivoStatus = "baixa medica";
      if (folga.motivo === "ferias") motivoStatus = "ferias";
      else if (folga.motivo === "folga") motivoStatus = "folga";
      return {
        isExtra: true,
        label: "Acionado emergencialmente na folga",
        motivo: "Tecnico em " + motivoStatus + " neste dia (retroativo)",
      };
    }
  }

  // Caso 1b: Tecnico em folga HOJE (clicou no botao "Estou de folga hoje")
  if (tecnico.status && tecnico.status !== "ativo" && tecnico.statusDesde) {
    const desdeData = new Date(tecnico.statusDesde);
    const desdeStr = desdeData.toISOString().slice(0, 10);
    if (desdeStr === dataStr) {
      let motivoStatus = "baixa medica";
      if (tecnico.status === "ferias") motivoStatus = "ferias";
      else if (tecnico.status === "folga") motivoStatus = "folga";
      return {
        isExtra: true,
        label: "Acionado emergencialmente na folga",
        motivo: "Tecnico em " + motivoStatus + " neste dia",
      };
    }
  }

  // Caso 2: Sabado/domingo
  if (dow === 0 || dow === 6) {
    return {
      isExtra: true,
      label: "Acionado emergencialmente na folga",
      motivo: dow === 0 ? "Domingo" : "Sabado",
    };
  }

  // Caso 3: Feriado
  if (ehFeriado) {
    return {
      isExtra: true,
      label: "Acionado emergencialmente na folga",
      motivo: "Feriado",
    };
  }

  // Caso 4: Fora do expediente (em dia util)
  if (!dentroExpediente) {
    const inicioStr = fmtHora(ini.hora, ini.min);
    if (ehTI) {
      return {
        isExtra: true,
        label: "Acionado emergencialmente na folga",
        motivo: "Fora do expediente (iniciado " + inicioStr + ")",
      };
    } else {
      return {
        isExtra: true,
        label: "Acionado emergencialmente na folga",
        motivo: "Fora do horario SG 07-19 (iniciado " + inicioStr + ")",
      };
    }
  }

  // Caso 5: Fim cai fora do expediente (mas inicio dentro)
  if (fim) {
    const fimDow = fim.dow;
    const fimDentro = ehTI
      ? isDentroExpedienteTI(fimDow, fim.hora, fim.min)
      : isDentroExpedienteSG(fimDow, fim.hora, fim.min);
    if (!fimDentro) {
      return {
        isExtra: true,
        label: "Acionado emergencialmente na folga",
        motivo: "Encerrado fora do expediente (" + fmtHora(fim.hora, fim.min) + ")",
      };
    }
  }

  return { isExtra: false, label: "", motivo: "" };
}

// Helper pra formatar status
export function statusTecnicoLabel(status?: string): string {
  if (status === "ferias") return "Ferias";
  if (status === "baixa") return "Baixa Medica";
  if (status === "folga") return "Folga";
  return "Ativo";
}
