/**
 * Converte uma string de data ISO para um objeto Date no fuso local do navegador.
 * 
 * O backend salva timestamps com timezone explícito (ex: "2025-12-17T16:00:00-03:00" para 16h Brasília).
 * O JavaScript converte automaticamente para o fuso local do usuário ao criar o Date.
 * 
 * @param dateString - String de data no formato ISO (ex: "2025-12-17T16:00:00-03:00")
 * @returns Date object convertido para o fuso horário local
 */
export function parseUTCDate(dateString: string): Date {
  // Conversão nativa: JavaScript automaticamente interpreta o timezone
  // e converte para o fuso local do navegador
  return new Date(dateString);
}
