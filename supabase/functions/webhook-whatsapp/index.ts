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

    // === VERIFICAÇÃO DE DUPLICATA USANDO messageId DO Z-API (CRÍTICO) ===
    const { data: jaProcessado } = await supabase
      .from('conversas')
      .select('id')
      .eq('zapi_message_id', zapiMessageId)
      .maybeSingle();

    if (jaProcessado) {
      console.log('⏭️ Mensagem já processada (messageId:', zapiMessageId, ')');
      return new Response(JSON.stringify({ 
        status: 'already_processed',
        message_id: zapiMessageId 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Nova mensagem, processando...');

    console.log(`💬 Mensagem de ${phone} (user: ${userId}): ${message}${imageUrl ? ' [+imagem]' : ''}`);

    // 1. Buscar contexto das últimas 5 conversas
    const { data: ultimasConversas } = await supabase
      .from('conversas')
      .select('mensagem_usuario, mensagem_malu')
      .eq('whatsapp_de', phone)
      .order('criada_em', { ascending: false })
      .limit(5);

    const contexto = ultimasConversas?.reverse().map(c => ({
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

    // 5. Salvar conversa no banco COM zapi_message_id (evita duplicatas)
    const mensagemParaSalvar = imageUrl ? `${imageCaption || 'Imagem'} [+imagem]` : message;
    
    const { error: conversaError } = await supabase
      .from('conversas')
      .insert([{
        whatsapp_de: phone,
        mensagem_usuario: mensagemParaSalvar,
        mensagem_malu: respostaFinal,
        contexto: contexto,
        usuario_id: userId,
        zapi_message_id: zapiMessageId  // ✅ Identificador único do Z-API
      }]);

    // Se der erro de UNIQUE constraint, é duplicata (race condition catch)
    if (conversaError?.code === '23505') {
      console.log('⏭️ Duplicata detectada via unique constraint:', zapiMessageId);
      return new Response(JSON.stringify({ status: 'duplicate_constraint' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (conversaError) {
      console.error('Erro ao salvar conversa:', conversaError);
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
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
