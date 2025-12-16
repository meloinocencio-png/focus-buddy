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
    console.log('📥 Webhook Z-API recebido:', JSON.stringify(payload));

    // Z-API pode enviar diferentes formatos de payload
    // Extrair número e mensagem
    let phone = payload.phone || payload.from || payload.sender?.id;
    let message = payload.message || payload.text?.message || payload.body;

    // Remover sufixo @c.us se existir
    if (phone && phone.includes('@')) {
      phone = phone.split('@')[0];
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

    // Ignorar mensagens vazias, de grupo, ou status updates
    if (!message || payload.isGroup || payload.isStatusReply) {
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

    console.log(`💬 Mensagem de ${phone} (user: ${userId}): ${message}`);

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

    // 2. Processar com a Malu
    const processarResponse = await fetch(
      `${supabaseUrl}/functions/v1/processar-conversa-malu`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ mensagem: message, contexto })
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
        usuario_id: userId
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
        }
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
      }

      const { data: eventos } = await supabase
        .from('eventos')
        .select('*')
        .gte('data', dataInicio.toISOString())
        .lte('data', dataFim.toISOString())
        .order('data', { ascending: true });

      if (eventos && eventos.length > 0) {
        const listaEventos = eventos.map(e => {
          const dataEvento = new Date(e.data);
          const horaStr = dataEvento.getHours() > 0 
            ? ` às ${dataEvento.getHours()}h${dataEvento.getMinutes() > 0 ? dataEvento.getMinutes() : ''}`
            : '';
          const emoji = e.tipo === 'aniversario' ? '🎂' : 
                       e.tipo === 'saude' ? '💊' :
                       e.tipo === 'tarefa' ? '📝' : '📅';
          let item = `• ${emoji} ${e.titulo}${horaStr}`;
          if (e.endereco) {
            item += `\n  📍 ${e.endereco}`;
          }
          return item;
        }).join('\n');

        const periodoTexto = maluResponse.periodo === 'hoje' ? 'Hoje' :
                            maluResponse.periodo === 'amanha' ? 'Amanhã' : 'Essa semana';

        respostaFinal = `${periodoTexto} você tem:\n${listaEventos}`;
      } else {
        const periodoTexto = maluResponse.periodo === 'hoje' ? 'hoje' :
                            maluResponse.periodo === 'amanha' ? 'amanhã' : 'essa semana';
        respostaFinal = `Você está livre ${periodoTexto}!`;
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

    // 5. Salvar conversa no banco
    const { error: conversaError } = await supabase
      .from('conversas')
      .insert([{
        whatsapp_de: phone,
        mensagem_usuario: message,
        mensagem_malu: respostaFinal,
        contexto: contexto,
        usuario_id: userId
      }]);

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
