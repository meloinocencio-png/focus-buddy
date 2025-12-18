import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Importar utilitários compartilhados
import { 
  corsHeaders, 
  getUserIdFromWhatsApp, 
  calcularProximoIntervalo, 
  formatarIntervalo,
  criarTimestampBrasilia
} from "../_shared/utils.ts";
import { buscarEventos } from "../_shared/eventos.ts";
import { processarRecorrencia, gerarOcorrencias } from "../_shared/recorrencia.ts";

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Enviar Onboarding WhatsApp (3 mensagens sequenciais)
// ═══════════════════════════════════════════════════════════
async function enviarOnboardingWhatsApp(
  phone: string, 
  supabaseUrl: string, 
  supabaseServiceKey: string
): Promise<void> {
  const enviarMensagem = async (msg: string) => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${supabaseServiceKey}` 
        },
        body: JSON.stringify({ phone, message: msg })
      });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem de onboarding:', error);
    }
  };
  
  // MENSAGEM 1: Boas-vindas + alívio emocional
  const msg1 = `👋 Oi! Eu sou a *Malu*!

Vim te ajudar a *nunca mais esquecer* compromissos, remédios e tarefas.

Você não precisa lembrar de tudo. *Eu lembro por você.* ✨`;

  await enviarMensagem(msg1);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // MENSAGEM 2: Diferencial (o que a torna especial)
  const msg2 = `O que eu faço de diferente? 🤔

🔁 *Insisto até você fazer* (Não aviso só 1 vez e esqueço)
🧠 *Entendo você* (Texto, áudio, até foto de convite)
🎉 *Comemoro suas conquistas* (Porque você merece!)`;

  await enviarMensagem(msg2);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // MENSAGEM 3: Call to Action (primeiro sucesso imediato)
  const msg3 = `Vamos testar? 🚀

Me fala algo tipo:
💊 "Tomar remédio todo dia às 20h"
📅 "Dentista terça às 14h"
🎂 "Aniversário da Maria dia 25"

Pode ser por texto ou áudio! *Vai, testa agora!* 👇`;

  await enviarMensagem(msg3);
  
  console.log(`✅ Onboarding enviado para ${phone} (3 mensagens)`);
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

    // ═══════════════════════════════════════════════════════════
    // HANDLER: Message Status Update (leitura, entrega, etc)
    // ═══════════════════════════════════════════════════════════
    // IMPORTANTE: Mensagens novas vêm com status: "RECEIVED" mas TÊM conteúdo (text, audio, image)
    // Status updates reais (READ, DELIVERED, SENT) NÃO têm conteúdo de mensagem
    const hasMessageContent = payload.text || payload.audio || payload.image;
    const isRealStatusUpdate = payload.event === 'message-status-update' || 
      (payload.status && 
       ['READ', 'DELIVERED', 'SENT', 'PLAYED'].includes(payload.status.toUpperCase()) && 
       !hasMessageContent);

    if (isRealStatusUpdate) {
      const messageId = payload.messageId || payload.id || payload.key?.id;
      const status = payload.status?.toUpperCase() || '';
      
      console.log(`[ZAPI STATUS] messageId: ${messageId}, status: ${status}`);
      
      // Apenas READ marca como lido
      if (status === 'READ') {
        const { error } = await supabase
          .from('lembretes_enviados')
          .update({
            lido_em: new Date().toISOString(),
            status: 'lido'
          })
          .eq('zapi_message_id', messageId);
        
        if (error) {
          console.error('❌ Erro ao atualizar status de leitura:', error);
        } else {
          console.log(`✅ Mensagem ${messageId} marcada como lida`);
        }
      }
      
      return new Response(JSON.stringify({ ok: true, type: 'status-update' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

    // ═══════════════════════════════════════════════════════════
    // DETECTAR PRIMEIRA CONVERSA (ONBOARDING)
    // ═══════════════════════════════════════════════════════════
    const { count: totalConversas } = await supabase
      .from('conversas')
      .select('*', { count: 'exact', head: true })
      .eq('whatsapp_de', phone);

    const ehPrimeiraConversa = (totalConversas || 0) === 0;

    if (ehPrimeiraConversa) {
      console.log('🎉 PRIMEIRA CONVERSA! Iniciando onboarding para:', phone);
      
      // Enviar sequência de onboarding (3 mensagens)
      await enviarOnboardingWhatsApp(phone, supabaseUrl, supabaseServiceKey);
      
      // Salvar conversa de onboarding (sem lock pois é caso especial)
      await supabase.from('conversas').insert([{
        whatsapp_de: phone,
        mensagem_usuario: message,
        mensagem_malu: '[Onboarding enviado - 3 mensagens]',
        usuario_id: userId,
        zapi_message_id: zapiMessageId
      }]);
      
      return new Response(JSON.stringify({ 
        status: 'ok', 
        onboarding: true,
        message: 'Onboarding enviado com sucesso'
      }), {
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

    // 1. Buscar contexto das últimas 10 conversas (aumentado para melhor interpretação)
    const { data: ultimasConversas } = await supabase
      .from('conversas')
      .select('mensagem_usuario, mensagem_malu')
      .eq('whatsapp_de', phone)
      .order('criada_em', { ascending: false })
      .limit(10);

    const contexto: any[] = ultimasConversas?.reverse().map(c => ({
      usuario: c.mensagem_usuario,
      malu: c.mensagem_malu
    })) || [];

    console.log('📚 Contexto carregado:', contexto.length, 'mensagens');

    // ═══════════════════════════════════════════════════════════
    // DETECTAR SE ÚLTIMA MENSAGEM DA MALU FOI PERGUNTA
    // ═══════════════════════════════════════════════════════════
    let ultimaPerguntaMalu = false;
    let textoUltimaPergunta = '';

    if (contexto.length > 0) {
      const ultimaMensagemMalu = contexto[contexto.length - 1]?.malu;
      
      if (ultimaMensagemMalu && ultimaMensagemMalu.includes('?')) {
        ultimaPerguntaMalu = true;
        textoUltimaPergunta = ultimaMensagemMalu;
        console.log('📝 Última mensagem da Malu foi pergunta:', textoUltimaPergunta.substring(0, 80));
      }
    }

    // Se resposta curta após pergunta, adicionar contexto implícito para o Claude
    const respostaCurta = message.trim().length < 30;

    if (ultimaPerguntaMalu && respostaCurta) {
      console.log('⚡ Resposta curta detectada após pergunta! Adicionando hint para Claude.');
      
      // Adicionar hint como mensagem de sistema para ajudar Claude interpretar
      contexto.push({
        role: 'system',
        content: `[CONTEXTO: Você acabou de perguntar: "${textoUltimaPergunta}". A resposta "${message}" é provavelmente resposta a essa pergunta. Interprete de acordo - NÃO pergunte "sim o quê?" ou "não o quê?"!]`
      });
    }

    // ═══════════════════════════════════════════════════════════
    // CARREGAR LOCAIS FAVORITOS DO USUÁRIO
    // ═══════════════════════════════════════════════════════════
    const { data: locaisFavoritos } = await supabase
      .from('locais_favoritos')
      .select('apelido, endereco')
      .eq('usuario_id', userId);

    console.log(`📍 ${locaisFavoritos?.length || 0} locais favoritos carregados`);

    // ═══════════════════════════════════════════════════════════
    // VERIFICAR SE É ESCOLHA NUMÉRICA PARA AÇÃO PENDENTE
    // ═══════════════════════════════════════════════════════════
    const ehNumero = /^\d+$/.test(message.trim());
    
    if (ehNumero && contexto.length > 0) {
      const escolhaNum = parseInt(message.trim());
      
      // Verificar se tem ação pendente de marcar_status
      const acaoPendenteStatus = contexto.find((c: any) => c.acao_pendente === 'marcar_status');
      
      if (acaoPendenteStatus) {
        const indice = escolhaNum - 1;
        
        if (indice >= 0 && indice < acaoPendenteStatus.eventos.length) {
          const eventoId = acaoPendenteStatus.eventos[indice];
          
          // Buscar nome do evento
          const { data: eventoEscolhido } = await supabase
            .from('eventos')
            .select('titulo')
            .eq('id', eventoId)
            .single();
          
          // Atualizar status
          const { error: updateError } = await supabase
            .from('eventos')
            .update({ status: acaoPendenteStatus.novo_status })
            .eq('id', eventoId);
          
          let respostaFinal: string;
          if (updateError) {
            console.error('Erro ao atualizar status:', updateError);
            respostaFinal = '❌ Erro ao atualizar status.';
          } else {
            const statusEmoji = acaoPendenteStatus.novo_status === 'concluido' ? '✅' : '⏳';
            const statusTexto = acaoPendenteStatus.novo_status === 'concluido' ? 'concluído' : 'pendente';
            console.log(`✅ Status atualizado via escolha: ${eventoEscolhido?.titulo}`);
            respostaFinal = `${statusEmoji} *${eventoEscolhido?.titulo}* marcado como ${statusTexto}!`;
          }
          
          // Enviar resposta
          await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ phone, message: respostaFinal })
          });
          
          // Atualizar conversa
          await supabase
            .from('conversas')
            .update({
              mensagem_usuario: message,
              mensagem_malu: respostaFinal,
              contexto: []  // Limpar contexto após ação
            })
            .eq('id', conversaId);
          
          return new Response(JSON.stringify({ status: 'ok', resposta: respostaFinal }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          // Número inválido
          const respostaFinal = '❌ Número inválido. Escolha um número da lista.';
          
          await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ phone, message: respostaFinal })
          });
          
          await supabase
            .from('conversas')
            .update({ mensagem_usuario: message, mensagem_malu: respostaFinal, contexto })
            .eq('id', conversaId);
          
          return new Response(JSON.stringify({ status: 'ok', resposta: respostaFinal }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Continuar verificando outras ações pendentes (editar/cancelar existentes)
    }

    // ═══════════════════════════════════════════════════════════
    // PASSAR LOCAIS FAVORITOS NO CONTEXTO (como texto formatado)
    // ═══════════════════════════════════════════════════════════
    if (locaisFavoritos && locaisFavoritos.length > 0) {
      const locaisTexto = 'LOCAIS SALVOS (use ao criar eventos):\n' +
        locaisFavoritos.map((l: any) => `- "${l.apelido}": ${l.endereco}`).join('\n');
      
      contexto.push({
        role: 'system',
        content: locaisTexto
      });
    }

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
      // ═══════════════════════════════════════════════════════════
      // SUBSTITUIR APELIDO DE LOCAL POR ENDEREÇO COMPLETO
      // ═══════════════════════════════════════════════════════════
      let enderecoFinal = maluResponse.endereco || null;
      
      if (enderecoFinal && locaisFavoritos && locaisFavoritos.length > 0) {
        const enderecoLower = enderecoFinal.toLowerCase();
        
        // Busca inteligente: exata > includes
        let localMatch = locaisFavoritos.find((l: any) => 
          enderecoLower === l.apelido.toLowerCase()
        );
        
        if (!localMatch) {
          localMatch = locaisFavoritos.find((l: any) => 
            enderecoLower.includes(l.apelido.toLowerCase()) ||
            enderecoLower.includes(`na ${l.apelido.toLowerCase()}`)
          );
        }
        
        if (localMatch) {
          console.log(`📍 Substituindo "${enderecoFinal}" → "${localMatch.endereco}"`);
          enderecoFinal = localMatch.endereco;
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // DETECTAR ORIGEM DA VIAGEM ("saindo de/da/do...")
      // ═══════════════════════════════════════════════════════════
      let origemViagem: string | null = null;
      
      // Patterns para detectar origem
      const origemPatterns = [
        /saindo\s+d[aeo]\s+(.+?)(?:\s*[,.]|$)/i,
        /partindo\s+d[aeo]\s+(.+?)(?:\s*[,.]|$)/i,
        /vindo\s+d[aeo]\s+(.+?)(?:\s*[,.]|$)/i,
        /a\s+partir\s+d[aeo]\s+(.+?)(?:\s*[,.]|$)/i
      ];
      
      for (const pattern of origemPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          let origemDetectada = match[1].trim();
          
          // Limpar palavras finais que não são endereço
          origemDetectada = origemDetectada
            .replace(/\s+(às?\s+\d+|para\s+o|no\s+dia|amanhã|hoje|segunda|terça|quarta|quinta|sexta|sábado|domingo).*/i, '')
            .trim();
          
          // Verificar se é um local favorito
          if (locaisFavoritos && locaisFavoritos.length > 0) {
            const origemLower = origemDetectada.toLowerCase();
            const localMatch = locaisFavoritos.find((l: any) => 
              origemLower === l.apelido.toLowerCase() ||
              origemLower.includes(l.apelido.toLowerCase())
            );
            
            if (localMatch) {
              origemViagem = localMatch.endereco;
              console.log(`📍 Origem detectada (local favorito): "${origemDetectada}" → "${origemViagem}"`);
            } else {
              origemViagem = origemDetectada;
              console.log(`📍 Origem detectada: "${origemViagem}"`);
            }
          } else {
            origemViagem = origemDetectada;
            console.log(`📍 Origem detectada: "${origemViagem}"`);
          }
          break;
        }
      }
      
      // Criar evento no banco
      const eventoData: any = {
        tipo: maluResponse.tipo || 'compromisso',
        titulo: maluResponse.titulo,
        data: maluResponse.data,
        pessoa: maluResponse.pessoa,
        endereco: enderecoFinal,  // ✅ Usar endereço substituído
        lembretes: ['7d', '1d', 'hoje'],
        usuario_id: userId,
        checklist: maluResponse.checklist || [],
        origem_viagem: origemViagem  // ✅ NEW: Origem da viagem
      };

      // Se tem hora, adicionar ao timestamp com timezone de Brasília (-03:00)
      if (maluResponse.hora && maluResponse.data) {
        eventoData.data = `${maluResponse.data}T${maluResponse.hora}:00-03:00`;
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
        
        // ═══════════════════════════════════════════════════════════
        // VERIFICAR SE É PRIMEIRO EVENTO DO USUÁRIO (CELEBRAÇÃO ESPECIAL)
        // ═══════════════════════════════════════════════════════════
        const { count: totalEventosUsuario } = await supabase
          .from('eventos')
          .select('*', { count: 'exact', head: true })
          .eq('usuario_id', userId);

        const ehPrimeiroEvento = (totalEventosUsuario || 0) === 1;

        if (ehPrimeiroEvento) {
          console.log('🎉 PRIMEIRO EVENTO CRIADO! Enviando celebração...');
          
          // Calcular tempo até ativação
          const { data: dadosUsuario } = await supabase
            .from('whatsapp_usuarios')
            .select('criado_em')
            .eq('whatsapp', phone)
            .single();
          
          const tempoAtivacaoMs = dadosUsuario?.criado_em 
            ? Date.now() - new Date(dadosUsuario.criado_em).getTime()
            : null;
          const tempoAtivacaoSegundos = tempoAtivacaoMs ? Math.round(tempoAtivacaoMs / 1000) : null;
          
          // Registrar métrica de ativação
          if (tempoAtivacaoSegundos !== null) {
            await supabase
              .from('whatsapp_usuarios')
              .update({ 
                primeiro_evento_criado_em: new Date().toISOString(),
                tempo_ate_ativacao_segundos: tempoAtivacaoSegundos
              })
              .eq('whatsapp', phone);
            
            console.log(`⏱ Tempo até ativação: ${tempoAtivacaoSegundos}s`);
          }
          
          // Formatar data para exibição
          const dataEvento = evento.data ? new Date(evento.data) : null;
          const dataFormatada = dataEvento 
            ? dataEvento.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : '';
          
          // Mensagem de celebração especial (substituir a resposta normal)
          respostaFinal = `🎉 *PRIMEIRO LEMBRETE CRIADO!*

✅ ${evento.titulo}
📅 ${dataFormatada}

Pronto! Quando chegar a hora, eu te aviso!

💡 *Dica:* Você pode:
- Criar quantos quiser
- Falar por áudio 🎤
- Mandar foto de convite 📸
- Pedir "minha agenda"

Relaxa, eu cuido! 😊`;
        } else {
          // Resposta normal para eventos subsequentes
          if (enderecoFinal) {
            respostaFinal += `\n📍 ${enderecoFinal}`;
          } else {
            respostaFinal += '\n📍 Quer adicionar o endereço?';
          }
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

      // ✅ ATUALIZADO: Buscar eventos incluindo concluídos (para mostrar status)
      const { data: eventosRaw } = await supabase
        .from('eventos')
        .select('*')
        .eq('usuario_id', userId)
        .neq('status', 'cancelado')  // Excluir só cancelados
        .gte('data', dataInicio.toISOString())
        .lte('data', dataFim.toISOString())
        .order('data', { ascending: true });
      
      let eventos = eventosRaw || [];
      
      // ✅ NOVO: Aplicar filtro de status se especificado
      if (maluResponse.filtro_status) {
        eventos = eventos.filter((e: any) => 
          e.status === maluResponse.filtro_status || 
          (!e.status && maluResponse.filtro_status === 'pendente')
        );
        console.log(`🔍 Filtrado por ${maluResponse.filtro_status}: ${eventos.length} eventos`);
      }

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
        
        const emojiTipo = evento.tipo === 'aniversario' ? '🎂' : 
                          evento.tipo === 'saude' ? '💊' :
                          evento.tipo === 'tarefa' ? '📝' : '📅';
        
        // ✅ NOVO: Emoji por status
        const emojiStatus = 
          evento.status === 'concluido' ? '✅ ' : 
          evento.status === 'cancelado' ? '❌ ' : '';
        
        // Tachado para concluídos (WhatsApp: ~texto~)
        let titulo = evento.titulo;
        if (evento.status === 'concluido') {
          titulo = `~${evento.titulo}~`;
        }
        
        let linha = `• ${emojiStatus}${emojiTipo} ${titulo}`;
        if (horaStr) linha += ` — ${horaStr}`;
        
        // Status texto (para cancelados)
        if (evento.status === 'cancelado') {
          linha += ' _(cancelado)_';
        }
        
        // Truncar endereço se muito longo (max 45 chars) - não mostrar se concluído
        if (evento.endereco && evento.status !== 'concluido') {
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
        if (diasPeriodo > 1 && !maluResponse.filtro_status) footer += ` nos próximos ${diasPeriodo} dias`;
        
        // ✅ NOVO: Adicionar resumo de status (se não é consulta filtrada)
        if (!maluResponse.filtro_status) {
          const concluidos = eventos.filter((e: any) => e.status === 'concluido').length;
          const pendentes = eventos.filter((e: any) => 
            e.status !== 'concluido' && e.status !== 'cancelado'
          ).length;
          
          if (concluidos > 0 || pendentes > 0) {
            footer += `\n✅ ${concluidos} feito${concluidos === 1 ? '' : 's'} | ⏳ ${pendentes} pendente${pendentes === 1 ? '' : 's'}`;
          }
        }
        
        if (eventos.length > 5 && !maluResponse.filtro_status) {
          footer += `\n💡 Use "hoje" ou "semana" para ver menos`;
        }
        
        respostaFinal = `📅 *SUA AGENDA*\n\n${blocos.join(separador)}${footer}`;
      } else {
        // ✅ NOVO: Mensagens especiais para filtros vazios
        if (maluResponse.filtro_status === 'pendente') {
          respostaFinal = '🎉 Tudo feito! Nada pendente.';
        } else if (maluResponse.filtro_status === 'concluido') {
          respostaFinal = '📝 Nenhum evento concluído ainda.';
        } else {
          // Mensagem vazia com feedback positivo
          const periodoTexto = maluResponse.periodo === 'hoje' ? 'hoje' :
                              maluResponse.periodo === 'amanha' ? 'amanhã' :
                              maluResponse.periodo === 'semana' ? 'essa semana' :
                              'nos próximos 30 dias';
          respostaFinal = `📅 *SUA AGENDA*\n\nNenhum evento ${periodoTexto}! 🎉\n\n💡 Use voz ou foto para criar.`;
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: EDITAR EVENTO (usando buscarEventos helper)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'editar_evento') {
      console.log('✏️ Buscando para editar:', maluResponse.busca);
      
      // Usar função helper que busca desde meia-noite
      const { eventos: eventosEncontrados, foiBuscaFlexivel } = await buscarEventos(
        supabase, userId, maluResponse.busca, 30
      );
      
      // Processar resultados
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
      // Aceitar ambos os tipos de contexto:
      // 1. Edição direta após busca exata (acao_pendente: 'editar')
      // 2. Confirmação após busca flexível (confirmar_evento_encontrado + proxima_acao: 'editar')
      const acaoPendente = contexto.find((c: any) => 
        c.acao_pendente === 'editar' || 
        (c.acao_pendente === 'confirmar_evento_encontrado' && c.proxima_acao === 'editar')
      );
      
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
    // HANDLER: CANCELAR EVENTO (usando buscarEventos helper)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'cancelar_evento') {
      console.log('❌ Buscando para cancelar:', maluResponse.busca);
      
      // Usar função helper que busca desde meia-noite
      const { eventos: eventosEncontrados, foiBuscaFlexivel } = await buscarEventos(
        supabase, userId, maluResponse.busca, 30
      );
      
      // Processar resultados
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
      // Aceitar ambos os tipos de contexto:
      // 1. Cancelamento direto após busca exata (acao_pendente: 'cancelar')
      // 2. Confirmação após busca flexível (confirmar_evento_encontrado + proxima_acao: 'cancelar')
      const acaoPendente = contexto.find((c: any) => 
        c.acao_pendente === 'cancelar' || 
        (c.acao_pendente === 'confirmar_evento_encontrado' && c.proxima_acao === 'cancelar')
      );
      
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
    // ═══════════════════════════════════════════════════════════
    // HANDLER: MARCAR STATUS DE EVENTO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'marcar_status') {
      console.log('✅ Marcando status:', maluResponse.busca, '→', maluResponse.novo_status);
      
      if (!maluResponse.busca || !maluResponse.novo_status) {
        respostaFinal = '❌ Especifique o evento para marcar.';
      } else {
        // Buscar eventos de hoje ou até 7 dias atrás (eventos recentes)
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        seteDiasAtras.setHours(0, 0, 0, 0);
        
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        amanha.setHours(23, 59, 59, 999);
        
        // 1️⃣ BUSCA EXATA primeiro
        const { data: buscaExata } = await supabase
          .from('eventos')
          .select('*')
          .eq('usuario_id', userId)
          .neq('status', 'cancelado')
          .gte('data', seteDiasAtras.toISOString())
          .lte('data', amanha.toISOString())
          .ilike('titulo', `%${maluResponse.busca}%`)
          .order('data', { ascending: false })
          .limit(5);
        
        let eventosEncontrados = buscaExata || [];
        let foiBuscaFlexivel = false;
        
        // 2️⃣ BUSCA FLEXÍVEL se não encontrar
        if (eventosEncontrados.length === 0) {
          console.log('🔍 Busca exata falhou, tentando busca flexível...');
          
          const palavras = (maluResponse.busca || '')
            .toLowerCase()
            .split(/\s+/)
            .filter((p: string) => p.length > 2);
          
          if (palavras.length > 0) {
            const { data: todosEventos } = await supabase
              .from('eventos')
              .select('*')
              .eq('usuario_id', userId)
              .neq('status', 'cancelado')
              .gte('data', seteDiasAtras.toISOString())
              .lte('data', amanha.toISOString())
              .order('data', { ascending: false });
            
            eventosEncontrados = (todosEventos || []).filter((evt: any) => {
              const tituloLower = evt.titulo.toLowerCase();
              return palavras.every((p: string) => tituloLower.includes(p));
            });
            
            if (eventosEncontrados.length > 0) {
              foiBuscaFlexivel = true;
              console.log('✅ Busca flexível encontrou:', eventosEncontrados.length, 'eventos');
            }
          }
        }
        
        // 3️⃣ Processar resultados
        if (eventosEncontrados.length === 0) {
          respostaFinal = `❌ Não encontrei "${maluResponse.busca}" nos últimos 7 dias.`;
          
        } else if (eventosEncontrados.length === 1) {
          const evento = eventosEncontrados[0];
          
          // Atualizar status
          const { error: updateError } = await supabase
            .from('eventos')
            .update({ status: maluResponse.novo_status })
            .eq('id', evento.id);
          
          if (updateError) {
            console.error('Erro ao atualizar status:', updateError);
            respostaFinal = '❌ Erro ao atualizar status.';
          } else {
            const statusEmoji = maluResponse.novo_status === 'concluido' ? '✅' : '⏳';
            const statusTexto = maluResponse.novo_status === 'concluido' ? 'concluído' : 'pendente';
            
            console.log(`✅ Status atualizado: ${evento.titulo} → ${maluResponse.novo_status}`);
            respostaFinal = `${statusEmoji} *${evento.titulo}* marcado como ${statusTexto}!`;
          }
          
        } else {
          // Múltiplos eventos - listar para escolha
          respostaFinal = `📋 Encontrei ${eventosEncontrados.length} eventos:\n\n`;
          
          eventosEncontrados.slice(0, 5).forEach((evt: any, idx: number) => {
            const d = new Date(evt.data);
            const dia = d.getDate().toString().padStart(2, '0');
            const mes = (d.getMonth() + 1).toString().padStart(2, '0');
            const hora = d.getHours();
            const min = d.getMinutes();
            const horaStr = `${hora}h${min > 0 ? min.toString().padStart(2, '0') : ''}`;
            
            const emojiStatus = 
              evt.status === 'concluido' ? '✅' : 
              evt.status === 'cancelado' ? '❌' : '⏳';
            
            respostaFinal += `${idx + 1}. ${emojiStatus} ${evt.titulo} — ${dia}/${mes} às ${horaStr}\n`;
          });
          
          respostaFinal += `\nQual marcar como concluído? (número)`;
          
          // Salvar no contexto para confirmação
          contexto.push({
            acao_pendente: 'marcar_status',
            eventos: eventosEncontrados.slice(0, 5).map((e: any) => e.id),
            novo_status: maluResponse.novo_status
          });
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: SALVAR LOCAL FAVORITO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'salvar_local') {
      console.log('📍 Salvando local:', maluResponse.apelido);
      
      // Validações básicas
      if (!maluResponse.apelido || !maluResponse.endereco) {
        respostaFinal = '❌ Especifique apelido e endereço.\nEx: "salva Clínica como Rua XV 500"';
      } else if (maluResponse.apelido.length < 2) {
        respostaFinal = '❌ Apelido muito curto (mínimo 2 caracteres)';
      } else if (maluResponse.endereco.length < 5) {
        respostaFinal = '❌ Endereço muito curto (mínimo 5 caracteres)';
      } else {
        const apelidoNormalizado = maluResponse.apelido.toLowerCase().trim().substring(0, 50);
        const enderecoLimpo = maluResponse.endereco.trim().substring(0, 200);
        
        // Verificar se já existe (upsert)
        const { data: existing } = await supabase
          .from('locais_favoritos')
          .select('id')
          .eq('usuario_id', userId)
          .ilike('apelido', apelidoNormalizado)
          .maybeSingle();
        
        if (existing) {
          // Atualizar existente
          const { error: updateError } = await supabase
            .from('locais_favoritos')
            .update({ endereco: enderecoLimpo, atualizado_em: new Date().toISOString() })
            .eq('id', existing.id);
          
          if (updateError) {
            console.error('Erro ao atualizar local:', updateError);
            respostaFinal = '❌ Erro ao atualizar local.';
          } else {
            console.log(`✅ Local atualizado: ${apelidoNormalizado}`);
            respostaFinal = `✅ *${maluResponse.apelido}* atualizado!\n📍 ${enderecoLimpo}`;
          }
        } else {
          // Criar novo
          const { error: insertError } = await supabase
            .from('locais_favoritos')
            .insert([{ usuario_id: userId, apelido: apelidoNormalizado, endereco: enderecoLimpo }]);
          
          if (insertError) {
            console.error('Erro ao salvar local:', insertError);
            respostaFinal = '❌ Erro ao salvar local.';
          } else {
            console.log(`✅ Local salvo: ${apelidoNormalizado}`);
            respostaFinal = `✅ *${maluResponse.apelido}* salvo!\n📍 ${enderecoLimpo}\n\n💡 Use: "evento na ${maluResponse.apelido}"`;
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: LISTAR LOCAIS FAVORITOS
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'listar_locais') {
      console.log('📍 Listando locais favoritos');
      
      const { data: locais } = await supabase
        .from('locais_favoritos')
        .select('apelido, endereco')
        .eq('usuario_id', userId)
        .order('apelido', { ascending: true });
      
      if (!locais || locais.length === 0) {
        respostaFinal = '📍 Nenhum local salvo.\n\n💡 Salve: "salva [nome] como [endereço]"';
      } else {
        respostaFinal = `📍 *SEUS LOCAIS* (${locais.length})\n\n`;
        
        locais.forEach((local: any, idx: number) => {
          respostaFinal += `${idx + 1}. *${local.apelido}*\n   📍 ${local.endereco}\n\n`;
        });
        
        respostaFinal += `💡 Use: "evento na [nome]"`;
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: REMOVER LOCAL FAVORITO
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'remover_local') {
      console.log('📍 Removendo local:', maluResponse.apelido);
      
      if (!maluResponse.apelido) {
        respostaFinal = '❌ Qual local remover?\nEx: "remove local Clínica"';
      } else {
        const apelidoNormalizado = maluResponse.apelido.toLowerCase().trim();
        
        // Buscar local com ILIKE (busca parcial)
        const { data: localEncontrado } = await supabase
          .from('locais_favoritos')
          .select('id, apelido, endereco')
          .eq('usuario_id', userId)
          .ilike('apelido', `%${apelidoNormalizado}%`)
          .maybeSingle();
        
        if (!localEncontrado) {
          respostaFinal = `❌ Local "${maluResponse.apelido}" não encontrado.\n\n💡 Veja: "meus locais"`;
        } else {
          // Remover
          const { error: deleteError } = await supabase
            .from('locais_favoritos')
            .delete()
            .eq('id', localEncontrado.id);
          
          if (deleteError) {
            console.error('Erro ao remover local:', deleteError);
            respostaFinal = '❌ Erro ao remover local.';
          } else {
            console.log(`✅ Local removido: ${localEncontrado.apelido}`);
            respostaFinal = `✅ *${localEncontrado.apelido}* removido!`;
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CRIAR EVENTO RECORRENTE
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'criar_recorrente') {
      console.log('🔁 Criando evento recorrente:', maluResponse.titulo);
      
      if (!maluResponse.titulo || !maluResponse.hora || !maluResponse.recorrencia) {
        respostaFinal = '❌ Especifique título, hora e frequência.\nEx: "toda segunda 9h: academia"';
      } else if (!maluResponse.recorrencia.duracao) {
        // Perguntar duração
        let descricaoFreq = '';
        
        if (maluResponse.recorrencia.frequencia === 'diario') {
          descricaoFreq = `dia às ${maluResponse.hora}`;
        } else if (maluResponse.recorrencia.frequencia === 'semanal') {
          const diasNomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
          const dias = (maluResponse.recorrencia.dias_semana || []).map((d: number) => diasNomes[d]).join(', ');
          descricaoFreq = `${dias} às ${maluResponse.hora}`;
        } else if (maluResponse.recorrencia.frequencia === 'mensal') {
          descricaoFreq = `dia ${maluResponse.recorrencia.dia_mes} às ${maluResponse.hora}`;
        }
        
        respostaFinal = `🔁 *${maluResponse.titulo}* agendado toda(o) ${descricaoFreq}\n\n⏰ Até quando?\nEx: "3 meses", "10 vezes", "fim do ano"`;
        
        // Salvar no contexto para confirmar depois
        contexto.push({
          acao_pendente: 'confirmar_recorrente',
          evento: {
            titulo: maluResponse.titulo,
            hora: maluResponse.hora,
            tipo: maluResponse.tipo || 'tarefa',
            pessoa: maluResponse.pessoa,
            endereco: maluResponse.endereco,
            recorrencia: maluResponse.recorrencia
          }
        });
      } else {
        // Tem duração - processar imediatamente
        respostaFinal = await processarRecorrencia(
          supabase, 
          userId,
          {
            titulo: maluResponse.titulo,
            hora: maluResponse.hora,
            tipo: maluResponse.tipo || 'tarefa',
            pessoa: maluResponse.pessoa,
            endereco: maluResponse.endereco,
            recorrencia: maluResponse.recorrencia
          }
        );
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CONFIRMAR RECORRENTE (após usuário informar duração)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'confirmar_recorrente') {
      const acaoPendente = contexto.find((c: any) => c.acao_pendente === 'confirmar_recorrente');
      
      if (!acaoPendente) {
        respostaFinal = '❌ Não há recorrência pendente.';
      } else {
        // Adicionar duração especificada pelo usuário
        acaoPendente.evento.recorrencia.duracao = message;
        
        respostaFinal = await processarRecorrencia(
          supabase,
          userId,
          acaoPendente.evento
        );
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: CRIAR LEMBRETE PERSISTENTE
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'criar_lembrete') {
      console.log('🔔 Criando lembrete persistente:', maluResponse.titulo);
      
      if (!maluResponse.titulo) {
        respostaFinal = '❌ Me diga o que precisa lembrar.\nEx: "lembra de comprar leite"';
      } else {
        // Criar evento do tipo lembrete (sem hora específica)
        const dataLembrete = new Date();
        dataLembrete.setHours(12, 0, 0, 0); // Meio-dia padrão (simbólico)
        
        const { data: evento, error: eventoError } = await supabase
          .from('eventos')
          .insert([{
            usuario_id: userId,
            tipo: 'lembrete',
            titulo: maluResponse.titulo,
            data: dataLembrete.toISOString(),
            status: 'pendente',
            eh_recorrente: false
          }])
          .select()
          .single();
        
        if (eventoError) {
          console.error('Erro ao criar lembrete:', eventoError);
          respostaFinal = '❌ Erro ao criar lembrete.';
        } else {
          // Criar follow-up
          const proximaPergunta = new Date();
          proximaPergunta.setHours(proximaPergunta.getHours() + 3); // Primeira pergunta em 3h
          
          const dataLimite = new Date();
          dataLimite.setDate(dataLimite.getDate() + 7); // Máximo 7 dias
          
          const { error: followupError } = await supabase
            .from('lembretes_followup')
            .insert([{
              evento_id: evento.id,
              usuario_id: userId,
              whatsapp: phone,
              tentativas: 0,
              proxima_pergunta: proximaPergunta.toISOString(),
              intervalo_atual: 180, // 3 horas em minutos
              max_tentativas: 10,
              max_dias: 7,
              data_limite: dataLimite.toISOString(),
              ativo: true,
              concluido: false
            }]);
          
          if (followupError) {
            console.error('Erro ao criar follow-up:', followupError);
            respostaFinal = '❌ Erro ao configurar lembrete.';
          } else {
            console.log(`✅ Lembrete criado com follow-up: ${evento.id}`);
            
            const horaStr = `${proximaPergunta.getHours()}h${proximaPergunta.getMinutes().toString().padStart(2, '0')}`;
            
            respostaFinal = `✅ *Lembrete criado:*\n📝 ${maluResponse.titulo}\n\n💡 Vou perguntar daqui 3h (${horaStr}) se você fez!`;
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════
    // HANDLER: RESPONDER A LEMBRETE (sim/não)
    // ═══════════════════════════════════════════════════════════
    else if (maluResponse.acao === 'responder_lembrete') {
      console.log('💬 Resposta a lembrete:', maluResponse.resposta_lembrete);
      
      // Buscar último follow-up ativo para este usuário
      const { data: followups } = await supabase
        .from('lembretes_followup')
        .select(`
          *,
          eventos!inner(id, titulo, tipo)
        `)
        .eq('usuario_id', userId)
        .eq('ativo', true)
        .eq('concluido', false)
        .order('ultima_pergunta', { ascending: false })
        .limit(1);
      
      if (!followups || followups.length === 0) {
        respostaFinal = '🤔 Não encontrei lembrete ativo. Do que você está falando?';
      } else {
        const followup = followups[0];
        const evento = followup.eventos as any;
        
        // Salvar resposta no histórico
        await supabase.from('lembretes_respostas').insert([{
          followup_id: followup.id,
          evento_id: evento.id,
          resposta_usuario: message,
          resposta_classificada: maluResponse.resposta_lembrete
        }]);
        
        if (maluResponse.resposta_lembrete === 'sim') {
          // ✅ CONCLUÍDO!
          await supabase
            .from('lembretes_followup')
            .update({ 
              concluido: true, 
              ativo: false 
            })
            .eq('id', followup.id);
          
          await supabase
            .from('eventos')
            .update({ status: 'concluido' })
            .eq('id', evento.id);
          
          console.log(`✅ Lembrete concluído: ${evento.titulo}`);
          
          respostaFinal = `🎉 Ótimo! *${evento.titulo}* marcado como feito!\n\n✅ Lembrete concluído`;
          
        } else if (maluResponse.resposta_lembrete === 'nao') {
          // ❌ NÃO FEZ - Escalar intervalo
          const novoIntervalo = calcularProximoIntervalo(followup.intervalo_atual, followup.tentativas);
          const proximaPergunta = new Date();
          proximaPergunta.setMinutes(proximaPergunta.getMinutes() + novoIntervalo);
          
          // Verificar se passou do limite de 7 dias
          const dataLimite = new Date(followup.data_limite);
          if (proximaPergunta > dataLimite) {
            // Expirou
            await supabase
              .from('lembretes_followup')
              .update({ ativo: false })
              .eq('id', followup.id);
            
            respostaFinal = `⏰ Ok! Esse lembrete expirou (7 dias).\n\nQuer criar um novo?`;
          } else {
            // Reagendar
            await supabase
              .from('lembretes_followup')
              .update({
                tentativas: followup.tentativas + 1,
                ultima_pergunta: new Date().toISOString(),
                proxima_pergunta: proximaPergunta.toISOString(),
                intervalo_atual: novoIntervalo
              })
              .eq('id', followup.id);
            
            console.log(`⏰ Reagendado: ${evento.titulo} para daqui ${novoIntervalo}min`);
            
            let tempoTexto = formatarIntervalo(novoIntervalo);
            
            respostaFinal = `✅ Sem problema!\n\n⏰ Vou perguntar ${tempoTexto}`;
          }
        } else {
          respostaFinal = '🤔 Não entendi. Você fez ou não?';
        }
      }
    }

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
