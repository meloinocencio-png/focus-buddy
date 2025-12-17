// ═══════════════════════════════════════════════════════════
// FUNÇÕES PARA EVENTOS RECORRENTES
// ═══════════════════════════════════════════════════════════

import { criarTimestampBrasilia } from './utils.ts';

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Processar e criar eventos recorrentes
// ═══════════════════════════════════════════════════════════
export async function processarRecorrencia(
  supabase: any,
  userId: string,
  eventoBase: any
): Promise<string> {
  
  console.log('🔁 Processando recorrência:', eventoBase);
  
  try {
    const duracao = (eventoBase.recorrencia.duracao || '3 meses').toLowerCase();
    let dataFim: Date | null = null;
    let numOcorrencias: number | null = null;
    
    // Detectar "X vezes"
    const vezesMatch = duracao.match(/(\d+)\s*vezes?/);
    if (vezesMatch) {
      numOcorrencias = Math.min(parseInt(vezesMatch[1]), 100); // Limite 100
    }
    
    // Detectar "X meses/semanas/dias"
    const periodoMatch = duracao.match(/(\d+)\s*(mes|meses|semana|semanas|dia|dias)/);
    if (periodoMatch) {
      const quantidade = parseInt(periodoMatch[1]);
      const unidade = periodoMatch[2];
      dataFim = new Date();
      
      if (unidade.startsWith('mes')) {
        dataFim.setMonth(dataFim.getMonth() + quantidade);
      } else if (unidade.startsWith('semana')) {
        dataFim.setDate(dataFim.getDate() + (quantidade * 7));
      } else if (unidade.startsWith('dia')) {
        dataFim.setDate(dataFim.getDate() + quantidade);
      }
    }
    
    // Detectar "até dezembro", "fim do ano"
    if (duracao.includes('dezembro') || duracao.includes('fim do ano')) {
      dataFim = new Date(new Date().getFullYear(), 11, 31);
    } else if (duracao.includes('janeiro')) {
      dataFim = new Date(new Date().getFullYear() + 1, 0, 31);
    } else if (duracao.includes('fevereiro')) {
      dataFim = new Date(new Date().getFullYear() + 1, 1, 28);
    } else if (duracao.includes('março') || duracao.includes('marco')) {
      dataFim = new Date(new Date().getFullYear() + 1, 2, 31);
    }
    
    // Padrão: 3 meses se não especificado
    if (!dataFim && !numOcorrencias) {
      dataFim = new Date();
      dataFim.setMonth(dataFim.getMonth() + 3);
    }
    
    // Calcular primeira data
    const [hora, minuto] = eventoBase.hora.split(':');
    let dataInicio = new Date();
    dataInicio.setHours(parseInt(hora), parseInt(minuto || '0'), 0, 0);
    
    // Ajustar para próxima ocorrência se semanal
    if (eventoBase.recorrencia.frequencia === 'semanal' && eventoBase.recorrencia.dias_semana?.length > 0) {
      const diaHoje = dataInicio.getDay();
      const diasOrdenados = [...eventoBase.recorrencia.dias_semana].sort((a: number, b: number) => a - b);
      let proximoDia = diasOrdenados.find((d: number) => d > diaHoje);
      
      if (proximoDia === undefined) {
        proximoDia = diasOrdenados[0];
        dataInicio.setDate(dataInicio.getDate() + (7 - diaHoje + proximoDia));
      } else {
        dataInicio.setDate(dataInicio.getDate() + (proximoDia - diaHoje));
      }
    }
    
    // Ajustar para próximo mês se mensal
    if (eventoBase.recorrencia.frequencia === 'mensal' && eventoBase.recorrencia.dia_mes) {
      const diaMes = eventoBase.recorrencia.dia_mes;
      if (dataInicio.getDate() > diaMes) {
        dataInicio.setMonth(dataInicio.getMonth() + 1);
      }
      dataInicio.setDate(diaMes);
    }
    
    // Formatar data com timezone Brasília (-03:00)
    const dataInicioStr = criarTimestampBrasilia(dataInicio, eventoBase.hora);
    
    // Criar primeiro evento (template)
    const { data: eventoOriginal, error: eventoError } = await supabase
      .from('eventos')
      .insert([{
        usuario_id: userId,
        tipo: eventoBase.tipo || 'tarefa',
        titulo: `${eventoBase.titulo} 🔁`,
        data: dataInicioStr,
        pessoa: eventoBase.pessoa,
        endereco: eventoBase.endereco,
        eh_recorrente: true,
        status: 'pendente'
      }])
      .select()
      .single();
    
    if (eventoError) {
      console.error('Erro ao criar evento original:', eventoError);
      throw eventoError;
    }
    
    // Criar regra de recorrência
    const { data: recorrencia, error: recError } = await supabase
      .from('eventos_recorrencia')
      .insert([{
        evento_original_id: eventoOriginal.id,
        usuario_id: userId,
        frequencia: eventoBase.recorrencia.frequencia,
        intervalo: eventoBase.recorrencia.intervalo || 1,
        dias_semana: eventoBase.recorrencia.dias_semana || null,
        dia_mes: eventoBase.recorrencia.dia_mes || null,
        data_inicio: dataInicio.toISOString().split('T')[0],
        data_fim: dataFim ? dataFim.toISOString().split('T')[0] : null,
        numero_ocorrencias: numOcorrencias,
        ativo: true
      }])
      .select()
      .single();
    
    if (recError) {
      console.error('Erro ao criar recorrência:', recError);
      throw recError;
    }
    
    // Atualizar evento original com recorrencia_id
    await supabase
      .from('eventos')
      .update({ recorrencia_id: recorrencia.id })
      .eq('id', eventoOriginal.id);
    
    // Gerar ocorrências futuras
    const ocorrencias = await gerarOcorrencias(
      supabase,
      eventoOriginal,
      recorrencia,
      userId,
      eventoBase.hora
    );
    
    console.log(`✅ ${ocorrencias.length} ocorrências criadas para recorrência ${recorrencia.id}`);
    
    // Montar resposta
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let resposta = `✅ *${eventoBase.titulo}* agendado! 🔁\n\n📅 ${ocorrencias.length + 1} eventos criados\n\nPróximos:\n`;
    
    // Mostrar primeiros 3
    const primeiros = ocorrencias.slice(0, 3);
    primeiros.forEach((evt: any) => {
      const d = new Date(evt.data);
      const diaSemana = diasSemana[d.getDay()];
      const dia = d.getDate().toString().padStart(2, '0');
      const mes = (d.getMonth() + 1).toString().padStart(2, '0');
      resposta += `• ${diaSemana} ${dia}/${mes} às ${eventoBase.hora}\n`;
    });
    
    if (ocorrencias.length > 3) {
      resposta += `• ... e mais ${ocorrencias.length - 3} eventos`;
    }
    
    return resposta;
    
  } catch (error) {
    console.error('Erro ao processar recorrência:', error);
    return '❌ Erro ao criar eventos recorrentes.';
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Gerar ocorrências individuais
// ═══════════════════════════════════════════════════════════
export async function gerarOcorrencias(
  supabase: any,
  eventoTemplate: any,
  recorrencia: any,
  userId: string,
  hora: string
): Promise<any[]> {
  
  const ocorrencias: any[] = [];
  const dataInicio = new Date(eventoTemplate.data);
  const dataFim = recorrencia.data_fim ? new Date(recorrencia.data_fim) : null;
  const maxOcorrencias = recorrencia.numero_ocorrencias || 100;
  const intervalo = recorrencia.intervalo || 1;
  
  let dataAtual = new Date(dataInicio);
  let contador = 0;
  
  // Pular primeira data (já criada como evento original)
  if (recorrencia.frequencia === 'diario') {
    dataAtual.setDate(dataAtual.getDate() + intervalo);
  } else if (recorrencia.frequencia === 'semanal') {
    const diasSemana = recorrencia.dias_semana || [];
    const diaAtual = dataAtual.getDay();
    let proximoDia = diasSemana.find((d: number) => d > diaAtual);
    
    if (proximoDia === undefined) {
      proximoDia = diasSemana[0];
      dataAtual.setDate(dataAtual.getDate() + (7 * intervalo - diaAtual + proximoDia));
    } else {
      dataAtual.setDate(dataAtual.getDate() + (proximoDia - diaAtual));
    }
  } else if (recorrencia.frequencia === 'mensal') {
    dataAtual.setMonth(dataAtual.getMonth() + intervalo);
  }
  
  while (contador < maxOcorrencias - 1 && (!dataFim || dataAtual <= dataFim)) {
    // Formatar data com timezone Brasília
    const dataStr = criarTimestampBrasilia(dataAtual, hora);
    
    // Criar evento individual
    const { data: evento, error: evtError } = await supabase
      .from('eventos')
      .insert([{
        usuario_id: userId,
        tipo: eventoTemplate.tipo,
        titulo: eventoTemplate.titulo.replace(' 🔁', ''),
        data: dataStr,
        pessoa: eventoTemplate.pessoa,
        endereco: eventoTemplate.endereco,
        recorrencia_id: recorrencia.id,
        eh_recorrente: true,
        status: 'pendente'
      }])
      .select()
      .single();
    
    if (evtError) {
      console.error('Erro ao criar ocorrência:', evtError);
      break;
    }
    
    if (evento) {
      ocorrencias.push(evento);
      
      // Criar vínculo na tabela de ocorrências
      await supabase.from('eventos_ocorrencia').insert([{
        recorrencia_id: recorrencia.id,
        evento_id: evento.id,
        data_ocorrencia: dataAtual.toISOString().split('T')[0]
      }]);
    }
    
    // Calcular próxima data
    if (recorrencia.frequencia === 'diario') {
      dataAtual.setDate(dataAtual.getDate() + intervalo);
    } else if (recorrencia.frequencia === 'semanal') {
      const diasSemana = recorrencia.dias_semana || [];
      const diaAtual = dataAtual.getDay();
      let proximoDia = diasSemana.find((d: number) => d > diaAtual);
      
      if (proximoDia === undefined) {
        proximoDia = diasSemana[0];
        dataAtual.setDate(dataAtual.getDate() + (7 * intervalo - diaAtual + proximoDia));
      } else {
        dataAtual.setDate(dataAtual.getDate() + (proximoDia - diaAtual));
      }
    } else if (recorrencia.frequencia === 'mensal') {
      dataAtual.setMonth(dataAtual.getMonth() + intervalo);
    }
    
    contador++;
  }
  
  return ocorrencias;
}
