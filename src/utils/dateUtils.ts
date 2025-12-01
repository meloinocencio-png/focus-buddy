/**
 * Converte uma string de data UTC para um objeto Date sem conversão de timezone.
 * Útil para exibir a hora exata que foi salva no banco, sem ajuste de fuso horário.
 * 
 * @param dateString - String de data no formato ISO (ex: "2025-12-17T14:00:00+00:00")
 * @returns Date object com a hora UTC interpretada como hora local
 */
export function parseUTCDate(dateString: string): Date {
  const date = new Date(dateString);
  
  // Criar nova data usando os componentes UTC como se fossem locais
  // Isso evita que o navegador converta automaticamente para o fuso local
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
}
