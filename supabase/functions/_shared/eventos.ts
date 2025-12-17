// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE BUSCA E MANIPULAÇÃO DE EVENTOS
// ═══════════════════════════════════════════════════════════

import { getInicioHoje } from './utils.ts';

export interface BuscaEventosResult {
  eventos: any[];
  foiBuscaFlexivel: boolean;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Buscar eventos (exata + flexível)
// Usado por: webhook-whatsapp (editar, cancelar, buscar, marcar_status)
// ═══════════════════════════════════════════════════════════
export async function buscarEventos(
  supabase: any,
  userId: string,
  termoBusca: string,
  diasFuturos: number = 30
): Promise<BuscaEventosResult> {
  
  console.log(`🔍 Buscando "${termoBusca}" nos próximos ${diasFuturos} dias`);
  
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + diasFuturos);
  
  // IMPORTANTE: Buscar desde HOJE 00:00 (não desde agora)
  const hojeInicio = getInicioHoje();
  
  // ───────────────────────────────────────────────────────────
  // ESTRATÉGIA 1: BUSCA EXATA (substring)
  // ───────────────────────────────────────────────────────────
  const { data: buscaExata } = await supabase
    .from('eventos')
    .select('*')
    .eq('usuario_id', userId)
    .or('status.is.null,status.eq.pendente')
    .gte('data', hojeInicio.toISOString())
    .lte('data', dataLimite.toISOString())
    .ilike('titulo', `%${termoBusca}%`)
    .order('data', { ascending: true })
    .limit(10);
  
  if (buscaExata && buscaExata.length > 0) {
    console.log(`✅ Encontrou ${buscaExata.length} com busca exata`);
    return { eventos: buscaExata, foiBuscaFlexivel: false };
  }
  
  // ───────────────────────────────────────────────────────────
  // ESTRATÉGIA 2: BUSCA FLEXÍVEL (por palavras - AND)
  // ───────────────────────────────────────────────────────────
  const palavras = termoBusca
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((p: string) => p.length > 2);
  
  if (palavras.length === 0) {
    console.log('⚠️ Nenhuma palavra válida para busca flexível');
    return { eventos: [], foiBuscaFlexivel: false };
  }
  
  console.log(`🔍 Busca flexível com palavras: ${palavras.join(', ')}`);
  
  // Buscar todos eventos e filtrar por palavras (AND)
  const { data: todosEventos } = await supabase
    .from('eventos')
    .select('*')
    .eq('usuario_id', userId)
    .or('status.is.null,status.eq.pendente')
    .gte('data', hojeInicio.toISOString())
    .lte('data', dataLimite.toISOString())
    .order('data', { ascending: true });
  
  const eventosFlexiveis = (todosEventos || []).filter((evento: any) => {
    const tituloLower = evento.titulo.toLowerCase();
    return palavras.every((palavra: string) => tituloLower.includes(palavra));
  });
  
  console.log(`${eventosFlexiveis.length > 0 ? '✅' : '❌'} Encontrou ${eventosFlexiveis.length} com busca flexível`);
  
  return { 
    eventos: eventosFlexiveis.slice(0, 10), 
    foiBuscaFlexivel: true 
  };
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Buscar eventos por período
// ═══════════════════════════════════════════════════════════
export async function buscarEventosPorPeriodo(
  supabase: any,
  userId: string,
  dataInicio: Date,
  dataFim: Date,
  apenasAtivos: boolean = true
): Promise<any[]> {
  
  let query = supabase
    .from('eventos')
    .select('*')
    .eq('usuario_id', userId)
    .gte('data', dataInicio.toISOString())
    .lte('data', dataFim.toISOString())
    .order('data', { ascending: true });
  
  if (apenasAtivos) {
    query = query.or('status.is.null,status.eq.pendente');
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Erro ao buscar eventos por período:', error);
    return [];
  }
  
  return data || [];
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar lista de eventos para mensagem
// ═══════════════════════════════════════════════════════════
export function formatarListaEventos(eventos: any[], maxItens: number = 5): string {
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const tipoEmoji: Record<string, string> = {
    aniversario: '🎂',
    compromisso: '📅',
    tarefa: '🛒',
    saude: '💊',
    lembrete: '🔔'
  };
  
  const limitado = eventos.slice(0, maxItens);
  
  return limitado.map((evt, i) => {
    const d = new Date(evt.data);
    const diaSemana = diasSemana[d.getDay()];
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const hora = d.getHours().toString().padStart(2, '0');
    const minuto = d.getMinutes().toString().padStart(2, '0');
    const emoji = tipoEmoji[evt.tipo] || '📌';
    
    return `${i + 1}. ${emoji} *${evt.titulo}*\n   ${diaSemana} ${dia}/${mes} às ${hora}:${minuto}`;
  }).join('\n\n');
}
