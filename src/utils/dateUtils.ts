/**
 * Converte uma string de data ISO para um objeto Date.
 *
 * ✅ Regra do projeto:
 * - Quando houver timezone explícito (ex: "-03:00" ou "Z"), respeitar.
 * - Quando NÃO houver timezone (ex: "2025-12-17T16:00:00"), assumir *Brasília* (-03:00)
 *   para evitar "pular" horas/dias por conversões implícitas em UTC.
 */

const BRASILIA_TZ = "America/Sao_Paulo";
const BRT_OFFSET = "-03:00";

function hasExplicitTimezone(dateString: string) {
  return /([zZ]|[+-]\d{2}:\d{2})$/.test(dateString);
}

/**
 * Mantido por compatibilidade (já é usado em vários lugares).
 * Apesar do nome, ele faz um parse "inteligente" com fallback para Brasília.
 */
export function parseUTCDate(dateString: string): Date {
  if (!dateString) return new Date(NaN);

  // Já tem timezone ("Z" ou "+/-HH:MM") → pode confiar
  if (hasExplicitTimezone(dateString)) return new Date(dateString);

  // Só data → assumir meio-dia em Brasília (evita cair no dia anterior por offset)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(`${dateString}T12:00:00${BRT_OFFSET}`);
  }

  // Data+hora sem timezone → assumir que foi informada em Brasília
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(dateString)) {
    return new Date(`${dateString}${BRT_OFFSET}`);
  }

  // Fallback
  return new Date(dateString);
}

function getParts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BRASILIA_TZ,
    ...options,
  }).formatToParts(date);
}

export function formatDateInputBrasilia(date: Date): string {
  const parts = getParts(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export function formatTimeInputBrasilia(date: Date): string {
  const parts = getParts(date, { hour: "2-digit", minute: "2-digit", hour12: false });
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** Constrói timestamp SEMPRE com -03:00 (Brasília) a partir de strings de input. */
export function buildBrasiliaTimestamp(dateYYYYMMDD: string, timeHHmm: string): string {
  const safeTime = /^\d{2}:\d{2}$/.test(timeHHmm) ? timeHHmm : "12:00";
  return `${dateYYYYMMDD}T${safeTime}:00${BRT_OFFSET}`;
}

/** Constrói timestamp em Brasília a partir de um Date (útil para "agora + 1h" etc). */
export function toBrasiliaTimestamp(date: Date): string {
  const d = formatDateInputBrasilia(date);
  const t = formatTimeInputBrasilia(date);
  return `${d}T${t}:00${BRT_OFFSET}`;
}
