import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: buscar usuario_id pelo número de WhatsApp
async function getUserIdFromWhatsApp(supabase: any, phone: string): Promise<string | null> {
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
// FUNÇÃO AUXILIAR: Buscar eventos (exata + flexível)
// ═══════════════════════════════════════════════════════════
async function buscarEventos(
  supabase: any,
  userId: string,
  termoBusca: string,
  diasFuturos: number = 30
): Promise<{ eventos: any[]; foiBuscaFlexivel: boolean }> {
  
  console.log(`🔍 Buscando "${termoBusca}" nos próximos ${diasFuturos} dias`);
  
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() + diasFuturos);
  
  // IMPORTANTE: Buscar desde HOJE 00:00 (não desde agora)
  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload = await req.json();
    
    // === LOG COMPLETO DO PAYLOAD (DEBUG CRÍTICO) ===
    console.log('📦 PAYLOAD COMPLETO:', JSON.stringify(payload, null, 2));

    // === EXTRAIR messageId ÚNICO DO Z-API (CRÍTICO para evitar duplicatas) ===
    let zapiMessageId = payload.messageId || payload.key?.id;
    if (!zapiMessageId || zapiMessageId === 'null' || zapiMessageId === 'undefined') {
      console.warn('⚠️ messageId ausente, gerando fallback');
      zapiMessageId = `fallback-${payload.phone || 'unknown'}-${Date.now()}`;
    }
    console.log('🆔 Z-API Message ID:', zapiMessageId);

    // Z-API pode enviar diferentes formatos de payload
    // Extrair número e mensagem
    let phone = payload.phone || payload.from || payload.sender?.id;
    let message = payload.message || payload.text?.message || payload.body;

    // Remover sufixo @c.us se existir
    if (phone && phone.includes('@')) {
      phone = phone.split('@')[0];
    }

    // === DETECÇÃO DE IMAGEM - MÚLTIPLOS CAMINHOS Z-API ===
    let imageUrl: string | null = null;
    let imageCaption: string | null = null;

    // Log de debug para todos os campos de imagem possíveis
    console.log('🔍 Verificando campos de imagem:', {
      'payload.image': !!payload.image,
      'payload.image?.imageUrl': payload.image?.imageUrl?.substring(0, 50),
      'payload.imageMessage': !!payload.imageMessage,
      'payload.imageMessage?.imageUrl': payload.imageMessage?.imageUrl?.substring(0, 50),
      'payload.media': !!payload.media,
      'payload.message?.imageMessage': !!payload.message?.imageMessage,
    });

    // Tentar múltiplos caminhos possíveis do Z-API
    if (payload.image?.imageUrl) {
      imageUrl = payload.image.imageUrl;
      imageCaption = payload.image.caption || '';
      console.log('🖼️ IMAGEM via payload.image');
    } else if (payload.imageMessage?.imageUrl) {
      imageUrl = payload.imageMessage.imageUrl;
      imageCaption = payload.imageMessage.caption || '';
      console.log('🖼️ IMAGEM via payload.imageMessage');
    } else if (payload.media?.url) {
      imageUrl = payload.media.url;
      imageCaption = payload.media.caption || '';
      console.log('🖼️ IMAGEM via payload.media');
    } else if (payload.message?.imageMessage?.url) {
      imageUrl = payload.message.imageMessage.url;
      imageCaption = payload.message?.imageMessage?.caption || '';
      console.log('🖼️ IMAGEM via payload.message.imageMessage');
    }

    if (imageUrl) {
      console.log('📸 URL DA IMAGEM:', imageUrl);
      console.log('📝 Caption:', imageCaption);
      console.log('📄 MimeType:', payload.image?.mimetype || payload.imageMessage?.mimetype || 'unknown');
    } else {
      console.log('📝 Mensagem sem imagem');
    }

    // Verificar se é mensagem de áudio e transcrever
    if (payload.audio?.audioUrl && !message) {
      console.log('🎤 Mensagem de áudio detectada, transcrevendo...');
      
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY não configurada');
        return new Response(JSON.stringify({ status: 'error', message: 'OpenAI não configurada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        // Baixar o áudio da URL
        console.log('📥 Baixando áudio de:', payload.audio.audioUrl);
        const audioResponse = await fetch(payload.audio.audioUrl);
        
        if (!audioResponse.ok) {
          throw new Error(`Erro ao baixar áudio: ${audioResponse.status}`);
        }

        const audioBuffer = await audioResponse.arrayBuffer();
        console.log('📦 Áudio baixado, tamanho:', audioBuffer.byteLength, 'bytes');

        // Criar FormData para enviar ao Whisper
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
        formData.append('file', audioBlob, 'audio.ogg');
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');

        // Enviar para OpenAI Whisper
        console.log('🔄 Enviando para Whisper...');
        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: formData
        });

        if (!whisperResponse.ok) {
          const errorText = await whisperResponse.text();
          throw new Error(`Erro Whisper: ${whisperResponse.status} - ${errorText}`);
        }

        const transcript = await whisperResponse.json();
        message = transcript.text;
        console.log('✅ Transcrição:', message);
      } catch (transcribeError) {
        console.error('❌ Erro na transcrição:', transcribeError);
        // Continuar mesmo com erro, apenas logando
        message = null;
      }
    }

    // Se tem imagem mas não tem mensagem de texto, usar caption ou mensagem padrão
    if (imageUrl && !message) {
      message = imageCaption || 'Analisar esta imagem';
    }

    // Ignorar mensagens vazias (sem texto E sem imagem), de grupo, ou status updates
    if ((!message && !imageUrl) || payload.isGroup || payload.isStatusReply) {
      console.log('⏭️ Mensagem ignorada (grupo, status ou vazia)');
      return new Response(JSON.stringify({ status: 'ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buscar usuario_id pelo número de WhatsApp
    const userId = await getUserIdFromWhatsApp(supabase, phone);

    if (!userId) {
      console.log(`⛔ WhatsApp não autorizado: ${phone}`);
      return new Response(JSON.stringify({ status: 'unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // === LOCK IMEDIATO: INSERT para bloquear duplicatas (RACE CONDITION FIX) ===
    const { data: lockResult, error: lockError } = await supabase
      .from('conversas')
      .insert([{
        whatsapp_de: phone,
        mensagem_usuario: message || '[processando]',
        mensagem_malu: '[processando]',  // Marcador temporário
        usuario_id: userId,
        zapi_message_id: zapiMessageId
      }])
      .select('id')
      .single();

    // Se deu erro de UNIQUE CONSTRAINT = já está sendo processada por outra instância
    if (lockError?.code === '23505') {
      console.log('⏭️ Mensagem já em processamento (lock):', zapiMessageId);
      return new Response(JSON.stringify({ 
        status: 'already_processing',
        message_id: zapiMessageId 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (lockError) {
      console.error('❌ Erro ao criar lock:', lockError);
      throw lockError;
    }

    const conversaId = lockResult.id;
    console.log('🔒 Lock criado:', conversaId);
    console.log(`💬 Mensagem de ${phone} (user: ${userId}): ${message}${imageUrl ? ' [+imagem]' : ''}`);

    // 1. Buscar contexto das últimas 5 conversas
    const { data: ultimasConversas } = await supabase
      .from('conversas')
      .select('mensagem_usuario, mensagem_malu')
      .eq('whatsapp_de', phone)
      .order('criada_em', { ascending: false })
      .limit(5);

    const contexto: any[] = ultimasConversas?.reverse().map(c => ({
      usuario: c.mensagem_usuario,
      malu: c.mensagem_malu
    })) || [];

    console.log('📚 Contexto carregado:', contexto.length, 'mensagens');

    // 2. Processar com a Malu (incluindo imageUrl se houver)
    const processarResponse = await fetch(
      `${supabaseUrl}/functions/v1/processar-conversa-malu`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ 
          mensagem: message, 
          imageUrl: imageUrl,
          contexto 
        })
      }
    );

    const maluResponse = await processarResponse.json();
    console.log('🤖 Resposta Malu:', maluResponse);

    let respostaFinal = maluResponse.resposta || 'Olá! Precisa de algo?';

    // 3. Executar ação se necessário
    if (maluResponse.acao === 'criar_evento') {
      // Criar evento no banco
      const eventoData: any = {
        tipo: maluResponse.tipo || 'compromisso',
        titulo: maluResponse.titulo,
        data: maluResponse.data,
        pessoa: maluResponse.pessoa,
        endereco: maluResponse.endereco || null,
        lembretes: ['7d', '1d', 'hoje'],
        usuario_id: userId,
        checklist: maluResponse.checklist || []
      };

      // Se tem hora, adicionar ao timestamp
      if (maluResponse.hora && maluResponse.data) {
        eventoData.data = `${maluResponse.data}T${maluResponse.hora}:00`;
      }

      const { data: evento, error: eventoError } = await supabase
        .from('eventos')
        .insert([eventoData])
        .select()
        .single();

      if (eventoError) {
        console.error('Erro ao criar evento:', eventoError);
        const { error: retryError } = await supabase
          .from('eventos')
          .insert([{ ...eventoData }]);
        
        if (retryError) {
          console.error('Erro retry:', retryError);
          respostaFinal = 'Não consegui salvar. Tente novamente.';
        }
      } else {
        console.log('✅ Evento criado:', evento);
        // Adicionar endereço na resposta se existir
        if (maluResponse.endereco) {
          respostaFinal += `\n📍 ${maluResponse.endereco}`;
        } else {
          // Perguntar sobre endereço se não tem
          respostaFinal += '\n📍 Quer adicionar o endereço?';
        }
      }
    } else if (maluResponse.acao === 'confirmar_evento') {
      // Apenas envia a mensagem de confirmação, não cria nada ainda
      // Os dados ficam salvos no contexto da conversa para quando confirmar
      respostaFinal = maluResponse.resposta || '📋 Confirma? (sim/não)';
      
      // Log para debug
      console.log('⏳ Aguardando confirmação do evento:', {
        titulo: maluResponse.titulo,
        data: maluResponse.data,
        hora: maluResponse.hora,
        endereco: maluResponse.endereco
      });
    } else if (maluResponse.acao === 'atualizar_endereco') {
      // Buscar último evento criado do usuário (últimas 24h)
      const { data: ultimoEvento, error: buscarError } = await supabase
        .from('eventos')
        .select('id, titulo')
        .eq('usuario_id', userId)
        .gte('criado_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('criado_em', { ascending: false })
        .limit(1)
        .single();

      if (ultimoEvento && !buscarError) {
        // Atualizar endereço do evento
        const { error: updateError } = await supabase
          .from('eventos')
          .update({ endereco: maluResponse.endereco })
          .eq('id', ultimoEvento.id);

        if (updateError) {
          console.error('Erro ao atualizar endereço:', updateError);
          respostaFinal = 'Não consegui salvar o endereço. Tente novamente.';
        } else {
          console.log(`✅ Endereço atualizado no evento ${ultimoEvento.id}: ${maluResponse.endereco}`);
          respostaFinal = maluResponse.resposta || '✅ Endereço adicionado!';
        }
      } else {
        console.log('⚠️ Nenhum evento recente encontrado para atualizar');
        respostaFinal = 'Não encontrei evento recente. Crie um novo com o endereço.';
      }
    } else if (maluResponse.acao === 'consultar_agenda') {
      // Buscar eventos do período
      const agora = new Date();
      let dataInicio = new Date(agora);
      let dataFim = new Date(agora);

      switch (maluResponse.periodo) {
        case 'hoje':
          dataFim.setHours(23, 59, 59, 999);
          break;
        case 'amanha':
          dataInicio.setDate(dataInicio.getDate() + 1);
          dataInicio.setHours(0, 0, 0, 0);
          dataFim.setDate(dataFim.getDate() + 1);
          dataFim.setHours(23, 59, 59, 999);
          break;
        case 'semana':
          dataFim.setDate(dataFim.getDate() + 7);
          break;
        case 'todos':
        default:
          // Máximo 30 dias (evita sobrecarga cognitiva para TDAH)
          dataFim.setDate(dataFim.getDate() + 30);
          break;
      }

      const { data: eventos } = await supabase
        .from('eventos')
        .select('*')
        .eq('usuario_id', userId)
        .or('status.is.null,status.eq.pendente')
        .gte('data', dataInicio.toISOString())
        .lte('data', dataFim.toISOString())
        .order('data', { ascending: true });

      // Funções auxiliares para formatação TDAH-friendly
      const formatarDiaHeader = (dataStr: string, qtdEventos: number): string => {
        const data = new Date(dataStr + 'T12:00:00');
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const diaSemana = diasSemana[data.getDay()];
        const diaNum = data.getDate().toString().padStart(2, '0');
        const mes = (data.getMonth() + 1).toString().padStart(2, '0');
        const ano = data.getFullYear();
        
        const contadorTexto = qtdEventos > 1 ? ` — ${qtdEventos} eventos` : '';
        
        // Hoje = URGENTE
        if (data.toDateString() === hoje.toDateString()) {
          return `📆 *HOJE (${diaNum}/${mes})* ⚡${contadorTexto}`;
        }
        // Amanhã = Próximo
        if (data.toDateString() === amanha.toDateString()) {
          return `📆 *Amanhã (${diaNum}/${mes})* 🔔${contadorTexto}`;
        }
        // Este ano
        if (ano === hoje.getFullYear()) {
          return `📆 *${diaSemana} (${diaNum}/${mes})*${contadorTexto}`;
        }
        // Ano diferente
        return `📆 *${diaNum}/${mes}/${ano}*${contadorTexto}`;
      };

      const formatarEvento = (evento: any): string => {
        const dataEvento = new Date(evento.data);
        const hora = dataEvento.getHours();
        const minutos = dataEvento.getMinutes();
        const horaStr = hora > 0 
          ? `${hora}h${minutos > 0 ? minutos.toString().padStart(2, '0') : ''}`
          : '';
        
        const emoji = evento.tipo === 'aniversario' ? '🎂' : 
                      evento.tipo === 'saude' ? '💊' :
                      evento.tipo === 'tarefa' ? '📝' : '📅';
        
        let linha = `• ${emoji} ${evento.titulo}`;
        if (horaStr) linha += ` — ${horaStr}`;
        
        // Truncar endereço se muito longo (max 45 chars)
        if (evento.endereco) {
          const enderecoTruncado = evento.endereco.length > 45 
            ? evento.endereco.substring(0, 42) + '...'
            : evento.endereco;
          linha += `\n   📍 ${enderecoTruncado}`;
        }
        return linha;
      };

      if (eventos && eventos.length > 0) {
        // Agrupar eventos por dia
        const eventosPorDia: Record<string, any[]> = {};
        eventos.forEach((evento: any) => {
          const chaveData = new Date(evento.data).toISOString().split('T')[0];
          if (!eventosPorDia[chaveData]) eventosPorDia[chaveData] = [];
          eventosPorDia[chaveData].push(evento);
        });
        
        // Ordenar dias e montar blocos
        const diasOrdenados = Object.keys(eventosPorDia).sort();
        const blocos = diasOrdenados.map(dia => {
          const eventosNoDia = eventosPorDia[dia];
          const header = formatarDiaHeader(dia, eventosNoDia.length);
          const itens = eventosNoDia.map(formatarEvento).join('\n');
          return `${header}\n${itens}`;
        });
        
        // Separador visual entre dias
        const separador = '\n───────────────\n';
        
        // Calcular período para footer
        const diasPeriodo = maluResponse.periodo === 'hoje' ? 1 :
                            maluResponse.periodo === 'amanha' ? 1 :
                            maluResponse.periodo === 'semana' ? 7 : 30;
        
        // Footer com contador e dica
        let footer = `\n\n✨ ${eventos.length} evento${eventos.length > 1 ? 's' : ''}`;
        if (diasPeriodo > 1) footer += ` nos próximos ${diasPeriodo} dias`;
        if (eventos.length > 5) footer += `\n💡 Use "hoje" ou "semana" para ver menos`;
        
        respostaFinal = `📅 *SUA AGENDA*\n\n${blocos.join(separador)}${footer}`;
      } else {
        // Mensagem vazia com feedback positivo
        const periodoTexto = maluResponse.periodo === 'hoje' ? 'hoje' :
                            maluResponse.periodo === 'amanha' ? 'amanhã' :
                            maluResponse.periodo === 'semana' ? 'essa semana' :
                            'nos próximos 30 dias';
        respostaFinal = `📅 *SUA AGENDA*\n\nNenhum evento ${periodoTexto}! 🎉\n\n💡 Use voz ou foto para criar.`;
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: EDITAR EVENTO (com busca flexível)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'editar_evento') {
      console.log('✏️ Buscando para editar:', maluResponse.busca);
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() + 30);
      
      // 1️⃣ BUSCA EXATA primeiro
      const { data: buscaExata } = await supabase
        .from('eventos')
        .select('*')
        .eq('usuario_id', userId)
        .or('status.is.null,status.eq.pendente')
        .gte('data', new Date().toISOString())
        .lte('data', dataLimite.toISOString())
        .ilike('titulo', `%${maluResponse.busca}%`)
        .order('data', { ascending: true })
        .limit(5);
      
      let eventosEncontrados = buscaExata || [];
      let foiBuscaFlexivel = false;
      
      // 2️⃣ Se não encontrou, BUSCA FLEXÍVEL por palavras
      if (eventosEncontrados.length === 0) {
        console.log('🔍 Busca exata falhou, tentando busca flexível...');
        
        const palavras = (maluResponse.busca || '')
          .toLowerCase()
          .split(' ')
          .filter((p: string) => p.length > 2); // Ignorar palavras curtas
        
        if (palavras.length > 0) {
          // Buscar todos eventos e filtrar no código
          const { data: todosEventos } = await supabase
            .from('eventos')
            .select('*')
            .eq('usuario_id', userId)
            .or('status.is.null,status.eq.pendente')
            .gte('data', new Date().toISOString())
            .lte('data', dataLimite.toISOString())
            .order('data', { ascending: true });
          
          // Filtrar eventos que contêm TODAS as palavras
          eventosEncontrados = (todosEventos || []).filter((evento: any) => {
            const tituloLower = evento.titulo.toLowerCase();
            return palavras.every((palavra: string) => tituloLower.includes(palavra));
          });
          
          if (eventosEncontrados.length > 0) {
            foiBuscaFlexivel = true;
            console.log('✅ Busca flexível encontrou:', eventosEncontrados.length, 'eventos');
          }
        }
      }
      
      // 3️⃣ Processar resultados
      if (eventosEncontrados.length === 0) {
        respostaFinal = `❌ Não encontrei "${maluResponse.busca}" nos próximos 30 dias.`;
        
      } else if (eventosEncontrados.length === 1) {
        const evento = eventosEncontrados[0];
        const d = new Date(evento.data);
        const dataF = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const horaF = `${d.getHours()}h${d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, '0') : ''}`;
        
        if (foiBuscaFlexivel) {
          // 🔍 PERGUNTAR se é o evento certo antes de mostrar edição
          respostaFinal = `🔍 Você quis dizer *${evento.titulo}* (${dataF} às ${horaF})?`;
          
          // Salvar no contexto para confirmar depois
          contexto.push({
            acao_pendente: 'confirmar_evento_encontrado',
            proxima_acao: 'editar',
            evento_id: evento.id,
            nova_data: maluResponse.nova_data,
            nova_hora: maluResponse.nova_hora
          });
          
        } else {
          // Busca exata - mostrar confirmação de edição direto
          respostaFinal = `📋 Encontrei:\n• ${evento.titulo}\n• ${dataF} às ${horaF}\n\n`;
          
          if (maluResponse.nova_data || maluResponse.nova_hora) {
            respostaFinal += `✏️ Mudar para:\n`;
            
            if (maluResponse.nova_data) {
              const nd = new Date(maluResponse.nova_data);
              respostaFinal += `• Data: ${nd.getDate().toString().padStart(2, '0')}/${(nd.getMonth() + 1).toString().padStart(2, '0')}\n`;
            }
            
            if (maluResponse.nova_hora) {
              const [h, m] = maluResponse.nova_hora.split(':');
              respostaFinal += `• Hora: ${h}h${m !== '00' ? m : ''}\n`;
            }
            
            respostaFinal += `\nConfirma?`;
            
            contexto.push({
              acao_pendente: 'editar',
              evento_id: evento.id,
              nova_data: maluResponse.nova_data,
              nova_hora: maluResponse.nova_hora
            });
          } else {
            respostaFinal = '❌ Especifique nova data ou hora.';
          }
        }
        
      } else {
        // Múltiplos eventos - listar para escolha
        respostaFinal = `📋 Encontrei ${eventosEncontrados.length} eventos:\n\n`;
        eventosEncontrados.slice(0, 5).forEach((evt: any, idx: number) => {
          const d = new Date(evt.data);
          const df = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
          const hf = `${d.getHours()}h${d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, '0') : ''}`;
          respostaFinal += `${idx + 1}. ${evt.titulo} - ${df} às ${hf}\n`;
        });
        respostaFinal += `\nQual editar? (número)`;
        
        contexto.push({
          acao_pendente: 'escolher_editar',
          eventos: eventosEncontrados.slice(0, 5).map((e: any) => e.id),
          nova_data: maluResponse.nova_data,
          nova_hora: maluResponse.nova_hora
        });
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CONFIRMAR EDIÇÃO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'confirmar_edicao') {
      const acaoPendente = contexto.find((c: any) => c.acao_pendente === 'editar');
      
      if (!acaoPendente) {
        respostaFinal = '❌ Não há edição pendente.';
      } else {
        // Buscar evento atual
        const { data: eventoAtual } = await supabase
          .from('eventos')
          .select('data')
          .eq('id', acaoPendente.evento_id)
          .single();
        
        if (!eventoAtual) {
          respostaFinal = '❌ Evento não encontrado.';
        } else {
          const dataAtual = new Date(eventoAtual.data);
          
          // Aplicar nova data
          if (acaoPendente.nova_data) {
            const [ano, mes, dia] = acaoPendente.nova_data.split('-');
            dataAtual.setFullYear(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
          }
          
          // Aplicar nova hora
          if (acaoPendente.nova_hora) {
            const [hora, minuto] = acaoPendente.nova_hora.split(':');
            dataAtual.setHours(parseInt(hora), parseInt(minuto), 0, 0);
          }
          
          // Atualizar
          const { error: updateError } = await supabase
            .from('eventos')
            .update({ data: dataAtual.toISOString() })
            .eq('id', acaoPendente.evento_id);
          
          if (updateError) {
            console.error('Erro ao editar:', updateError);
            respostaFinal = '❌ Erro ao editar.';
          } else {
            console.log('✅ Evento editado:', acaoPendente.evento_id);
            respostaFinal = '✅ Evento atualizado!';
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CANCELAR EVENTO (com busca flexível)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'cancelar_evento') {
      console.log('❌ Buscando para cancelar:', maluResponse.busca);
      
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() + 30);
      
      // 1️⃣ BUSCA EXATA primeiro
      const { data: buscaExata } = await supabase
        .from('eventos')
        .select('*')
        .eq('usuario_id', userId)
        .or('status.is.null,status.eq.pendente')
        .gte('data', new Date().toISOString())
        .lte('data', dataLimite.toISOString())
        .ilike('titulo', `%${maluResponse.busca}%`)
        .order('data', { ascending: true })
        .limit(5);
      
      let eventosEncontrados = buscaExata || [];
      let foiBuscaFlexivel = false;
      
      // 2️⃣ Se não encontrou, BUSCA FLEXÍVEL por palavras
      if (eventosEncontrados.length === 0) {
        console.log('🔍 Busca exata falhou, tentando busca flexível...');
        
        const palavras = (maluResponse.busca || '')
          .toLowerCase()
          .split(' ')
          .filter((p: string) => p.length > 2);
        
        if (palavras.length > 0) {
          const { data: todosEventos } = await supabase
            .from('eventos')
            .select('*')
            .eq('usuario_id', userId)
            .or('status.is.null,status.eq.pendente')
            .gte('data', new Date().toISOString())
            .lte('data', dataLimite.toISOString())
            .order('data', { ascending: true });
          
          eventosEncontrados = (todosEventos || []).filter((evento: any) => {
            const tituloLower = evento.titulo.toLowerCase();
            return palavras.every((palavra: string) => tituloLower.includes(palavra));
          });
          
          if (eventosEncontrados.length > 0) {
            foiBuscaFlexivel = true;
            console.log('✅ Busca flexível encontrou:', eventosEncontrados.length, 'eventos');
          }
        }
      }
      
      // 3️⃣ Processar resultados
      if (eventosEncontrados.length === 0) {
        respostaFinal = `❌ Não encontrei "${maluResponse.busca}" para cancelar.`;
        
      } else if (eventosEncontrados.length === 1) {
        const evento = eventosEncontrados[0];
        const d = new Date(evento.data);
        const df = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const hf = `${d.getHours()}h${d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, '0') : ''}`;
        
        if (foiBuscaFlexivel) {
          // 🔍 PERGUNTAR se é o evento certo
          respostaFinal = `🔍 Você quis dizer *${evento.titulo}* (${df} às ${hf})?`;
          
          contexto.push({
            acao_pendente: 'confirmar_evento_encontrado',
            proxima_acao: 'cancelar',
            evento_id: evento.id
          });
          
        } else {
          // Busca exata - mostrar confirmação de cancelamento direto
          respostaFinal = `📋 Encontrei:\n• ${evento.titulo}\n• ${df} às ${hf}\n\n❌ Confirma cancelamento?`;
          
          contexto.push({
            acao_pendente: 'cancelar',
            evento_id: evento.id
          });
        }
        
      } else {
        respostaFinal = `📋 Encontrei ${eventosEncontrados.length} eventos:\n\n`;
        eventosEncontrados.slice(0, 5).forEach((evt: any, idx: number) => {
          const d = new Date(evt.data);
          const df = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
          const hf = `${d.getHours()}h${d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, '0') : ''}`;
          respostaFinal += `${idx + 1}. ${evt.titulo} - ${df} às ${hf}\n`;
        });
        respostaFinal += `\nQual cancelar? (número)`;
        
        contexto.push({
          acao_pendente: 'escolher_cancelar',
          eventos: eventosEncontrados.slice(0, 5).map((e: any) => e.id)
        });
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CONFIRMAR SUGESTÃO DE EVENTO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'confirmar_sugestao') {
      const acaoPendente = contexto.find((c: any) => c.acao_pendente === 'confirmar_evento_encontrado');
      
      if (!acaoPendente) {
        respostaFinal = '❌ Não há sugestão pendente.';
      } else {
        // Buscar evento
        const { data: evento } = await supabase
          .from('eventos')
          .select('*')
          .eq('id', acaoPendente.evento_id)
          .single();
        
        if (!evento) {
          respostaFinal = '❌ Evento não encontrado.';
        } else {
          const d = new Date(evento.data);
          const dataF = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
          const horaF = `${d.getHours()}h${d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, '0') : ''}`;
          
          if (acaoPendente.proxima_acao === 'editar') {
            // Mostrar confirmação de edição
            respostaFinal = `📋 *${evento.titulo}*\n• ${dataF} às ${horaF}\n\n✏️ Mudar para:\n`;
            
            if (acaoPendente.nova_data) {
              const nd = new Date(acaoPendente.nova_data);
              respostaFinal += `• Data: ${nd.getDate().toString().padStart(2, '0')}/${(nd.getMonth() + 1).toString().padStart(2, '0')}\n`;
            }
            if (acaoPendente.nova_hora) {
              const [h, m] = acaoPendente.nova_hora.split(':');
              respostaFinal += `• Hora: ${h}h${m !== '00' ? m : ''}\n`;
            }
            respostaFinal += `\nConfirma?`;
            
            // Atualizar contexto para edição
            contexto.push({
              acao_pendente: 'editar',
              evento_id: acaoPendente.evento_id,
              nova_data: acaoPendente.nova_data,
              nova_hora: acaoPendente.nova_hora
            });
            
          } else if (acaoPendente.proxima_acao === 'cancelar') {
            // Mostrar confirmação de cancelamento
            respostaFinal = `📋 *${evento.titulo}*\n• ${dataF} às ${horaF}\n\n❌ Confirma cancelamento?`;
            
            contexto.push({
              acao_pendente: 'cancelar',
              evento_id: acaoPendente.evento_id
            });
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CONFIRMAR CANCELAMENTO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'confirmar_cancelamento') {
      const acaoPendente = contexto.find((c: any) => c.acao_pendente === 'cancelar');
      
      if (!acaoPendente) {
        respostaFinal = '❌ Não há cancelamento pendente.';
      } else {
        // Marcar como cancelado (não deletar - mantém histórico)
        const { error: updateError } = await supabase
          .from('eventos')
          .update({ status: 'cancelado' })
          .eq('id', acaoPendente.evento_id);
        
        if (updateError) {
          console.error('Erro ao cancelar:', updateError);
          respostaFinal = '❌ Erro ao cancelar.';
        } else {
          console.log('✅ Evento cancelado:', acaoPendente.evento_id);
          respostaFinal = '✅ Evento cancelado!';
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: BUSCAR EVENTO ESPECÍFICO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'buscar_evento') {
      console.log('🔍 Ação: buscar_evento');
      
      if (!maluResponse.busca) {
        respostaFinal = '❌ Me diga o que está procurando.';
      } else {
        const { eventos } = await buscarEventos(
          supabase,
          userId,
          maluResponse.busca,
          90  // Buscar até 90 dias
        );
        
        if (eventos.length === 0) {
          respostaFinal = `❌ Não encontrei "${maluResponse.busca}" nos próximos 90 dias.`;
          
        } else if (eventos.length === 1) {
          // ═══════════════════════════════════════════════════════
          // ÚNICO EVENTO - Resposta detalhada
          // ═══════════════════════════════════════════════════════
          const evento = eventos[0];
          const d = new Date(evento.data);
          
          // Dia da semana
          const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
          const diaSemana = diasSemana[d.getDay()];
          
          // Data formatada
          const dia = d.getDate().toString().padStart(2, '0');
          const mes = (d.getMonth() + 1).toString().padStart(2, '0');
          const hora = d.getHours();
          const min = d.getMinutes();
          const horaStr = `${hora}h${min > 0 ? min.toString().padStart(2, '0') : ''}`;
          
          // Emoji por tipo
          const emoji = 
            evento.tipo === 'aniversario' ? '🎂' : 
            evento.tipo === 'saude' ? '💊' :
            evento.tipo === 'tarefa' ? '📝' : '📅';
          
          // Calcular dias restantes
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const eventoDia = new Date(d);
          eventoDia.setHours(0, 0, 0, 0);
          const diasRestantes = Math.ceil(
            (eventoDia.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          let relativo = '';
          if (diasRestantes === 0) relativo = ' ⚡ HOJE!';
          else if (diasRestantes === 1) relativo = ' 🔔 AMANHÃ';
          else if (diasRestantes > 1 && diasRestantes <= 7) relativo = ` (em ${diasRestantes} dias)`;
          
          // Montar resposta
          respostaFinal = `${emoji} *${evento.titulo}*\n`;
          respostaFinal += `📅 ${diaSemana} ${dia}/${mes} às ${horaStr}${relativo}`;
          
          // Adicionar endereço se existir
          if (evento.endereco) {
            const enderecoTruncado = evento.endereco.length > 45 
              ? evento.endereco.substring(0, 42) + '...'
              : evento.endereco;
            respostaFinal += `\n📍 ${enderecoTruncado}`;
          }
          
        } else if (eventos.length <= 3) {
          // ═══════════════════════════════════════════════════════
          // 2-3 EVENTOS - Lista resumida com detalhes
          // ═══════════════════════════════════════════════════════
          respostaFinal = `📋 Encontrei ${eventos.length} eventos:\n\n`;
          
          eventos.forEach((evt: any) => {
            const d = new Date(evt.data);
            const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const diaSemana = diasSemana[d.getDay()];
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            const hora = d.getHours();
            const min = d.getMinutes();
            const horaStr = `${hora}h${min > 0 ? min.toString().padStart(2, '0') : ''}`;
            
            const emoji = 
              evt.tipo === 'aniversario' ? '🎂' : 
              evt.tipo === 'saude' ? '💊' :
              evt.tipo === 'tarefa' ? '📝' : '📅';
            
            respostaFinal += `${emoji} *${evt.titulo}*\n`;
            respostaFinal += `   ${diaSemana} ${dia}/${mes} às ${horaStr}\n\n`;
          });
          
        } else {
          // ═══════════════════════════════════════════════════════
          // 4+ EVENTOS - Lista compacta (máx 5)
          // ═══════════════════════════════════════════════════════
          respostaFinal = `📋 Encontrei ${eventos.length} eventos:\n\n`;
          
          eventos.slice(0, 5).forEach((evt: any, idx: number) => {
            const d = new Date(evt.data);
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            const hora = d.getHours();
            const min = d.getMinutes();
            const horaStr = `${hora}h${min > 0 ? min.toString().padStart(2, '0') : ''}`;
            
            respostaFinal += `${idx + 1}. ${evt.titulo} — ${dia}/${mes} às ${horaStr}\n`;
          });
          
          if (eventos.length > 5) {
            respostaFinal += `\n... e mais ${eventos.length - 5}`;
          }
          
          respostaFinal += `\n\n💡 Use "agenda semana" para ver detalhes`;
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: SNOOZE DE LEMBRETE (ADIAR)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'snooze_lembrete') {
      console.log('⏰ Snooze solicitado:', maluResponse.minutos, 'minutos');
      
      if (!maluResponse.minutos || maluResponse.minutos < 5 || maluResponse.minutos > 180) {
        respostaFinal = '❌ Use entre 5 e 180 minutos (máx 3h).';
      } else {
        // Calcular quando enviar
        const enviarEm = new Date();
        enviarEm.setMinutes(enviarEm.getMinutes() + maluResponse.minutos);
        
        // ═══════════════════════════════════════════════════════
        // RECONECTAR COM ÚLTIMO LEMBRETE ENVIADO (últimas 2h)
        // ═══════════════════════════════════════════════════════
        let mensagemSnooze = '⏰ Lembrete adiado!';
        let eventoId = null;
        
        // Buscar último lembrete enviado para esse usuário
        const duasHorasAtras = new Date();
        duasHorasAtras.setHours(duasHorasAtras.getHours() - 2);
        
        const { data: ultimoLembrete } = await supabase
          .from('lembretes_enviados')
          .select(`
            evento_id,
            tipo_lembrete,
            enviado_em,
            eventos!inner(titulo, data, tipo)
          `)
          .eq('eventos.usuario_id', userId)
          .gte('enviado_em', duasHorasAtras.toISOString())
          .order('enviado_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (ultimoLembrete?.eventos) {
          eventoId = ultimoLembrete.evento_id;
          const evento = ultimoLembrete.eventos as any;
          
          // Calcular tempo restante até o evento
          const dataEvento = new Date(evento.data);
          const agora = new Date();
          const minutosRestantes = Math.ceil((dataEvento.getTime() - agora.getTime()) / (1000 * 60));
          
          // Emoji por tipo
          const emoji = evento.tipo === 'aniversario' ? '🎂' : 
                        evento.tipo === 'saude' ? '💊' :
                        evento.tipo === 'tarefa' ? '📝' : '⏰';
          
          if (minutosRestantes > 0) {
            const horasRestantes = Math.floor(minutosRestantes / 60);
            const minsRestantes = minutosRestantes % 60;
            
            let tempoStr = '';
            if (horasRestantes > 0) {
              tempoStr = `${horasRestantes}h${minsRestantes > 0 ? minsRestantes.toString().padStart(2, '0') : ''}`;
            } else {
              tempoStr = `${minsRestantes}min`;
            }
            
            mensagemSnooze = `${emoji} ${evento.titulo} em ${tempoStr}`;
          } else {
            mensagemSnooze = `${emoji} ${evento.titulo}`;
          }
          
          console.log(`✅ Reconectado com evento: ${evento.titulo}`);
        } else {
          console.log('⚠️ Nenhum lembrete recente encontrado, criando snooze genérico');
        }
        
        // Criar lembrete snooze
        const { error: snoozeError } = await supabase
          .from('lembretes_snooze')
          .insert([{
            usuario_id: userId,
            whatsapp: phone,
            mensagem: mensagemSnooze,
            enviar_em: enviarEm.toISOString(),
            enviado: false,
            evento_id: eventoId
          }]);
        
        if (snoozeError) {
          console.error('Erro ao criar snooze:', snoozeError);
          respostaFinal = '❌ Erro ao agendar lembrete.';
        } else {
          const horaSnooze = enviarEm.getHours();
          const minSnooze = enviarEm.getMinutes();
          const horaStr = `${horaSnooze}h${minSnooze.toString().padStart(2, '0')}`;
          
          console.log(`✅ Snooze criado para ${horaStr}:`, mensagemSnooze);
          
          respostaFinal = `✅ Ok! Lembro em ${maluResponse.minutos}min (${horaStr}).`;
        }
      }
    }

    // 4. Enviar resposta via WhatsApp
    const enviarResponse = await fetch(
      `${supabaseUrl}/functions/v1/enviar-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ phone, message: respostaFinal })
      }
    );

    const enviarResult = await enviarResponse.json();
    console.log('📤 Resultado envio:', enviarResult);

    // 5. Atualizar registro de lock com a resposta real
    const mensagemParaSalvar = imageUrl ? `${imageCaption || 'Imagem'} [+imagem]` : message;
    
    const { error: conversaError } = await supabase
      .from('conversas')
      .update({
        mensagem_usuario: mensagemParaSalvar,
        mensagem_malu: respostaFinal,
        contexto: contexto
      })
      .eq('id', conversaId);

    if (conversaError) {
      console.error('Erro ao atualizar conversa:', conversaError);
    }

    return new Response(
      JSON.stringify({ 
        status: 'ok',
        resposta: respostaFinal,
        acao: maluResponse.acao
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro no webhook:', error);
    
    // Nota: não deletamos o lock em caso de erro para evitar reprocessamento
    // O registro ficará com '[processando]' indicando falha
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
