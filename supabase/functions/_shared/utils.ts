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
// FUNÇÃO: Formatar data em formato brasileiro (COM TIMEZONE)
// ═══════════════════════════════════════════════════════════
export function formatarDataBR(data: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(data);
  
  const diaSemana = parts.find(p => p.type === 'weekday')?.value || 'Seg';
  const dia = parts.find(p => p.type === 'day')?.value || '01';
  const mes = parts.find(p => p.type === 'month')?.value || '01';
  const hora = parts.find(p => p.type === 'hour')?.value || '00';
  const minuto = parts.find(p => p.type === 'minute')?.value || '00';
  
  // Capitalizar primeira letra do dia da semana
  const diaSemanaCapitalizado = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).replace('.', '');
  
  return `${diaSemanaCapitalizado} ${dia}/${mes} às ${hora}:${minuto}`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Criar timestamp com timezone Brasília
// ═══════════════════════════════════════════════════════════
export function criarTimestampBrasilia(data: Date, hora: string): string {
  // ✅ CORRIGIDO: Extrair data em Brasília
  const parts = extrairPartesBrasilia(data);
  return `${parts.ano}-${parts.mes}-${parts.dia}T${hora}:00-03:00`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Extrair partes de data/hora em timezone de Brasília
// Usado para evitar bugs ao manipular Date objects em UTC
// ═══════════════════════════════════════════════════════════
export function extrairPartesBrasilia(date: Date): { 
  ano: string, 
  mes: string, 
  dia: string, 
  hora: string, 
  minuto: string 
} {
  const partsData = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const partsHora = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  return {
    ano: partsData.find(p => p.type === 'year')?.value || '2025',
    mes: partsData.find(p => p.type === 'month')?.value || '01',
    dia: partsData.find(p => p.type === 'day')?.value || '01',
    hora: partsHora.find(p => p.type === 'hour')?.value || '12',
    minuto: partsHora.find(p => p.type === 'minute')?.value || '00'
  };
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar data/hora curta em Brasília (DD/MM às HH:mm)
// ═══════════════════════════════════════════════════════════
export function formatarDataHoraCurta(date: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const dia = parts.find(p => p.type === 'day')?.value || '01';
  const mes = parts.find(p => p.type === 'month')?.value || '01';
  const hora = parts.find(p => p.type === 'hour')?.value || '00';
  const minuto = parts.find(p => p.type === 'minute')?.value || '00';

  return `${dia}/${mes} às ${hora}:${minuto}`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES: Helpers de Brasília (timezone fixo do produto)
// ═══════════════════════════════════════════════════════════
export function getDataYYYYMMDD_Brasilia(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';

  return `${year}-${month}-${day}`;
}

export function formatarTimestampBrasilia(date: Date): string {
  const data = getDataYYYYMMDD_Brasilia(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const second = parts.find((p) => p.type === 'second')?.value ?? '00';

  // Observação: Brasil não tem DST hoje; manter offset fixo evita o "vai e volta".
  return `${data}T${hour}:${minute}:${second}-03:00`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Obter início do dia atual em Brasília (00:00:00)
// ═══════════════════════════════════════════════════════════
export function getInicioHoje(): Date {
  const hojeStr = getDataYYYYMMDD_Brasilia(new Date());
  return new Date(`${hojeStr}T00:00:00-03:00`);
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar hora em horário de Brasília (BRT = UTC-3)
// ═══════════════════════════════════════════════════════════
export function formatarHoraBRT(date: Date): string {
  const offsetBRT = -3 * 60; // -180 minutos
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const brtTime = utcTime + (offsetBRT * 60 * 1000);
  const dateBRT = new Date(brtTime);
  
  const hora = dateBRT.getUTCHours().toString().padStart(2, '0');
  const minuto = dateBRT.getUTCMinutes().toString().padStart(2, '0');
  return `${hora}:${minuto}`;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Formatar tempo restante de forma amigável
// Ex: "3h30", "1h15", "45min"
// ═══════════════════════════════════════════════════════════
export function formatarTempoRestante(horasRestantes: number): string {
  const horas = Math.floor(horasRestantes);
  const minutos = Math.round((horasRestantes - horas) * 60);
  
  if (horas === 0) {
    return `${minutos}min`;
  } else if (minutos === 0) {
    return `${horas}h`;
  } else if (minutos <= 10) {
    return `${horas}h`;
  } else if (minutos >= 50) {
    return `${horas + 1}h`;
  } else if (minutos >= 25 && minutos <= 35) {
    return `${horas}h30`;
  } else {
    return `${horas}h${minutos}`;
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Anti-Spam Inteligente por Leitura
// Verifica se pode enviar lembrete ao usuário baseado em:
// - Lembretes críticos SEMPRE enviam
// - Se última mensagem foi lida → pode enviar
// - Janela anti-spam de 2h para não-críticos
// - Fallback de 6h se webhook de leitura falhar
// ═══════════════════════════════════════════════════════════
export async function podeEnviarLembreteUsuario(
  supabase: any,
  usuarioId: string,
  ehCritico: boolean
): Promise<boolean> {
  // Lembretes críticos (1h, 3h) SEMPRE enviam
  if (ehCritico) return true;

  // Buscar última mensagem enviada ao usuário
  const { data: ultimo, error } = await supabase
    .from('lembretes_enviados')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('enviado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Se erro ou nunca enviou → pode enviar
  if (error || !ultimo) return true;

  // Se última foi lida → pode enviar
  if (ultimo.lido_em) return true;

  const minutosDesde = (Date.now() - new Date(ultimo.enviado_em).getTime()) / (1000 * 60);

  // Janela anti-spam: 2 horas sem leitura → bloquear
  if (minutosDesde < 120) {
    console.log(`⏸️ Anti-spam: bloqueado (${Math.round(minutosDesde)}min desde último, não lido)`);
    return false;
  }

  // Fallback seguro: 6h sem leitura → enviar mesmo assim
  if (minutosDesde >= 360) {
    console.log(`✅ Anti-spam: fallback 6h atingido, enviando`);
    return true;
  }

  // Entre 2h e 6h: bloquear
  return false;
}
