// ═══════════════════════════════════════════════════════════
// UTILITÁRIOS COMPARTILHADOS
// ═══════════════════════════════════════════════════════════

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Calcular próximo intervalo (escala progressiva)
// Usado por: webhook-whatsapp, processar-lembretes-followup
// ═══════════════════════════════════════════════════════════
export function calcularProximoIntervalo(intervaloAtual: number, tentativas: number): number {
  // Escala: 3h → 6h → 12h → 24h (manhã seguinte)
  
  if (tentativas === 0) {
    return 180; // 3 horas
  } else if (tentativas === 1) {
    return 360; // 6 horas
  } else if (tentativas === 2) {
    return 720; // 12 horas
  } else {
    // 3+ tentativas: sempre manhã seguinte (9h do dia seguinte)
    const agora = new Date();
    const amanha9h = new Date();
    amanha9h.setDate(amanha9h.getDate() + 1);
    amanha9h.setHours(9, 0, 0, 0);
    
    const minutosAteAmanha = Math.ceil((amanha9h.getTime() - agora.getTime()) / (1000 * 60));
    return Math.max(minutosAteAmanha, 60); // Mínimo 1h
  }
}

// Versão simplificada usada por processar-lembretes-followup
export function calcularProximoIntervaloSimples(tentativas: number): number {
  if (tentativas === 0) {
    return 180; // 3 horas
  } else if (tentativas === 1) {
    return 360; // 6 horas
  } else if (tentativas === 2) {
    return 720; // 12 horas
  } else {
    const agora = new Date();
    const amanha9h = new Date();
    amanha9h.setDate(amanha9h.getDate() + 1);
    amanha9h.setHours(9, 0, 0, 0);
    
    const minutosAteAmanha = Math.ceil((amanha9h.getTime() - agora.getTime()) / (1000 * 60));
    return Math.max(minutosAteAmanha, 60);
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar intervalo em texto legível
// ═══════════════════════════════════════════════════════════
export function formatarIntervalo(minutos: number): string {
  if (minutos < 60) {
    return `em ${minutos} minutos`;
  } else if (minutos < 1440) {
    const horas = Math.floor(minutos / 60);
    return `daqui ${horas}h`;
  } else {
    return 'amanhã de manhã (9h)';
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Helper para buscar usuario_id pelo WhatsApp
// ═══════════════════════════════════════════════════════════
export async function getUserIdFromWhatsApp(supabase: any, phone: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('whatsapp_usuarios')
    .select('usuario_id')
    .eq('whatsapp', phone)
    .eq('ativo', true)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.usuario_id;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar data em formato brasileiro
// ═══════════════════════════════════════════════════════════
export function formatarDataBR(data: Date): string {
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const diaSemana = diasSemana[data.getDay()];
  const dia = data.getDate().toString().padStart(2, '0');
  const mes = (data.getMonth() + 1).toString().padStart(2, '0');
  const hora = data.getHours().toString().padStart(2, '0');
  const minuto = data.getMinutes().toString().padStart(2, '0');
  
  return `${diaSemana} ${dia}/${mes} às ${hora}:${minuto}`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Criar timestamp com timezone Brasília
// ═══════════════════════════════════════════════════════════
export function criarTimestampBrasilia(data: Date, hora: string): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  
  return `${ano}-${mes}-${dia}T${hora}:00-03:00`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Obter início do dia atual (00:00:00)
// ═══════════════════════════════════════════════════════════
export function getInicioHoje(): Date {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}
