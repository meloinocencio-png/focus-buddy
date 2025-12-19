import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/utils.ts";

interface MaluResponse {
  acao: 'criar_evento' | 'confirmar_evento' | 'editar_evento' | 'cancelar_evento' | 
        'confirmar_edicao' | 'confirmar_cancelamento' | 'confirmar_sugestao' |
        'buscar_evento' | 'snooze_lembrete' | 'marcar_status' |
        'salvar_local' | 'listar_locais' | 'remover_local' |
        'criar_recorrente' | 'confirmar_recorrente' |
        'criar_lembrete' | 'responder_lembrete' |  // ✅ NOVO: lembretes persistentes
        'consultar_agenda' | 'conversar' | 'atualizar_endereco';
  resposta?: string;
  tipo?: string;
  titulo?: string;
  data?: string;
  hora?: string;
  pessoa?: string;
  endereco?: string;
  periodo?: 'hoje' | 'amanha' | 'semana' | 'todos';
  checklist?: string[];
  busca?: string;        // Para editar/cancelar - palavra-chave do evento
  nova_data?: string;    // Para editar - nova data (YYYY-MM-DD)
  nova_hora?: string;    // Para editar - nova hora (HH:MM)
  minutos?: number;      // Para snooze - minutos para adiar
  novo_status?: 'pendente' | 'concluido';  // Para marcar_status
  filtro_status?: 'pendente' | 'concluido';  // Para filtrar agenda
  apelido?: string;      // Para locais favoritos
  // Recorrência
  recorrencia?: {
    frequencia: 'diario' | 'semanal' | 'mensal';
    intervalo?: number;
    dias_semana?: number[];
    dia_mes?: number;
    duracao?: string;
  };
  // ✅ NOVO: Lembretes persistentes
  eh_lembrete?: boolean;
  resposta_lembrete?: 'sim' | 'nao' | 'indefinido';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensagem, imageUrl, contexto } = await req.json();

    // ═══════════════════════════════════════════════════════════
    // DEBUG DETALHADO - INÍCIO DO PROCESSAMENTO
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(60));
    console.log('[DEBUG] ⏰ TIMESTAMP:', new Date().toISOString());
    console.log('[DEBUG] 📥 MENSAGEM RECEBIDA:', {
      texto: mensagem,
      tamanho: mensagem?.length || 0
    });
    console.log('[DEBUG] 🖼️ IMAGEM:', imageUrl ? imageUrl.substring(0, 80) + '...' : 'NENHUMA');
    
    // === LOG DETALHADO DO CONTEXTO ===
    console.log('[DEBUG] 📚 CONTEXTO CARREGADO:', {
      total_itens: contexto?.length || 0,
      tem_acao_pendente: contexto?.some((c: any) => c.acao_pendente),
      tem_mensagem_citada: contexto?.some((c: any) => c.mensagem_citada),
      itens: contexto?.map((c: any, i: number) => ({
        indice: i,
        tipo: c.role || (c.mensagem_citada ? 'mensagem_citada' : c.acao_pendente ? 'acao_pendente' : 'conversa'),
        preview: c.content?.substring(0, 80) || c.usuario?.substring(0, 50) || c.evento_titulo || JSON.stringify(c).substring(0, 80)
      }))
    });
    
    // Se tem ação pendente, log detalhado
    const acoesPendentesDebug = contexto?.filter((c: any) => c.acao_pendente);
    if (acoesPendentesDebug?.length > 0) {
      console.log('[DEBUG] 🔄 AÇÕES PENDENTES ENCONTRADAS:', JSON.stringify(acoesPendentesDebug, null, 2));
    }
    
    // Se tem mensagem citada, log detalhado
    const msgsCitadasDebug = contexto?.filter((c: any) => c.mensagem_citada || c.role === 'system');
    if (msgsCitadasDebug?.length > 0) {
      console.log('[DEBUG] ↩️ MENSAGENS CITADAS/SISTEMA:', JSON.stringify(msgsCitadasDebug, null, 2));
    }
    
    console.log('='.repeat(60));

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY não configurada');
    }

    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // ═══════════════════════════════════════════════════════════
    // PARTE 1 & 3: FORMATAR CONTEXTO + INJETAR AÇÕES PENDENTES
    // ═══════════════════════════════════════════════════════════
    
    // Extrair ações pendentes e mensagens citadas ANTES do histórico
    let contextoEstruturado = '';
    
    // Buscar ações pendentes
    const acoesPendentes = (contexto || []).filter((c: any) => c.acao_pendente);
    if (acoesPendentes.length > 0) {
      contextoEstruturado += `\n⚠️ AÇÕES PENDENTES AGORA (PROCESSAR PRIMEIRO!):\n`;
      acoesPendentes.forEach((ap: any) => {
        contextoEstruturado += `• Ação: ${ap.acao_pendente}\n`;
        if (ap.evento_id) contextoEstruturado += `  - Evento ID: ${ap.evento_id}\n`;
        if (ap.evento_titulo) contextoEstruturado += `  - Título: "${ap.evento_titulo}"\n`;
        if (ap.nova_hora) contextoEstruturado += `  - Nova hora: ${ap.nova_hora}\n`;
        if (ap.nova_data) contextoEstruturado += `  - Nova data: ${ap.nova_data}\n`;
        if (ap.novo_status) contextoEstruturado += `  - Novo status: ${ap.novo_status}\n`;
      });
      contextoEstruturado += `→ Se usuária confirmar (sim/ok/feito/confirmo), EXECUTE a ação pendente!\n\n`;
    }
    
    // Buscar mensagens citadas
    const msgsCitadas = (contexto || []).filter((c: any) => c.mensagem_citada);
    if (msgsCitadas.length > 0) {
      contextoEstruturado += `\n↩️ RESPONDENDO A MENSAGEM CITADA (reply do WhatsApp):\n`;
      msgsCitadas.forEach((mc: any) => {
        contextoEstruturado += `• Tipo: ${mc.tipo || 'mensagem'}\n`;
        if (mc.evento_titulo) contextoEstruturado += `  - Evento: "${mc.evento_titulo}"\n`;
        if (mc.evento_id) contextoEstruturado += `  - Evento ID: ${mc.evento_id}\n`;
        if (mc.evento_status) contextoEstruturado += `  - Status atual: ${mc.evento_status}\n`;
      });
      contextoEstruturado += `→ "Feito/ok/sim/pronto" = marcar como concluído usando marcar_status!\n\n`;
    }
    
    // Formatar contexto das últimas conversas (incluindo mensagens de sistema)
    const contextoFormatado = contexto && contexto.length > 0
      ? contexto.map((c: any) => {
          // Mensagens de sistema
          if (c.role === 'system') {
            return `[SISTEMA]: ${c.content}`;
          }
          
          // ✅ PARTE 1: Formatar ações pendentes como texto legível
          if (c.acao_pendente) {
            let texto = `[AÇÃO PENDENTE: ${c.acao_pendente}]`;
            if (c.evento_id) texto += `\n  └─ Evento ID: ${c.evento_id}`;
            if (c.evento_titulo) texto += `\n  └─ Título: "${c.evento_titulo}"`;
            if (c.nova_hora) texto += `\n  └─ Nova hora: ${c.nova_hora}`;
            if (c.nova_data) texto += `\n  └─ Nova data: ${c.nova_data}`;
            if (c.novo_status) texto += `\n  └─ Novo status: ${c.novo_status}`;
            return texto;
          }
          
          // ✅ PARTE 1: Formatar mensagem citada como texto legível
          if (c.mensagem_citada) {
            let texto = `[MENSAGEM CITADA - ${(c.tipo || 'REPLY').toUpperCase()}]`;
            if (c.evento_titulo) texto += `\n  └─ Evento: "${c.evento_titulo}"`;
            if (c.evento_id) texto += `\n  └─ Evento ID: ${c.evento_id}`;
            if (c.evento_status) texto += `\n  └─ Status: ${c.evento_status}`;
            return texto;
          }
          
          // Conversas normais
          if (c.usuario && c.malu) {
            return `Usuária: ${c.usuario}\nMalu: ${c.malu}`;
          }
          
          return '';
        }).filter(Boolean).join('\n\n')
      : 'Nenhuma conversa anterior';
    
    // Combinar contexto estruturado + histórico formatado
    const contextoCompleto = contextoEstruturado 
      ? `${contextoEstruturado}\n---\nHISTÓRICO DE CONVERSAS:\n${contextoFormatado}`
      : contextoFormatado;

    // ═══════════════════════════════════════════════════════════
    // PARTE 2: SYSTEM PROMPT SIMPLIFICADO E PRIORIZADO
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // PARTE 4: SYSTEM PROMPT SIMPLIFICADO (~300 LINHAS)
    // ═══════════════════════════════════════════════════════════
    const systemPrompt = `Você é Malu, assistente pessoal para pessoa com TDAH. Seja DIRETA e OBJETIVA.

⚡ PRIORIDADES (PROCESSAR NESTA ORDEM!):

1️⃣ SE TEM [AÇÃO PENDENTE] ou "EXECUTAR AÇÃO":
   - "sim/ok/confirmo/pode/isso/1/2/3" → EXECUTAR a ação pendente
   - "confirmar_edicao" se pendente era editar
   - "confirmar_cancelamento" se pendente era cancelar  
   - "criar_evento" se pendente era confirmar_evento

2️⃣ SE TEM [MENSAGEM CITADA]:
   - "feito/pronto/ok/sim" em reply → marcar_status concluido
   - Horário/data em reply → editar_evento
   - NUNCA pergunte "feito o quê?"

3️⃣ SE MALU FEZ PERGUNTA (?):
   - "sim/fiz/feito/pronto" → confirmar/executar
   - "não/ainda não" → responder negativamente
   - NUNCA pergunte "sim o quê?"

❌ PROIBIDO:
- Dizer "Não entendi" quando há contexto claro
- Perguntar "feito o quê?" ou "sim o quê?"
- Ignorar ação pendente ou mensagem citada
- Criar evento sem usar confirmar_evento primeiro

COMUNICAÇÃO: Máximo 2-3 linhas, 1 emoji. Use "você" (nunca "amor/querida").

AFIRMATIVO: sim, fiz, feito, ok, pronto, comprei, liguei, paguei, confirmo, pode
NEGATIVO: não, ainda não, esqueci, cancela, deixa

═══ AÇÕES DISPONÍVEIS ═══

📅 CRIAR EVENTO (sempre com confirmação):
{"acao": "confirmar_evento", "tipo": "compromisso|saude|aniversario|tarefa", "titulo": "...", "data": "YYYY-MM-DD", "hora": "HH:MM", "checklist": [...], "resposta": "📋 Entendi:\\n• [titulo]\\n• [data] às [hora]\\n\\nConfirma?"}

Após confirmação: {"acao": "criar_evento", ...mesmos dados, "resposta": "✅ Salvo!"}

✏️ EDITAR EVENTO:
{"acao": "editar_evento", "busca": "palavra-chave", "nova_data": "YYYY-MM-DD", "nova_hora": "HH:MM", "resposta": "🔍 Procurando..."}

Confirmação: {"acao": "confirmar_edicao"}

❌ CANCELAR EVENTO:
{"acao": "cancelar_evento", "busca": "palavra-chave", "resposta": "🔍 Procurando..."}

Confirmação: {"acao": "confirmar_cancelamento"}

🔍 BUSCAR EVENTO:
{"acao": "buscar_evento", "busca": "palavra-chave", "resposta": "🔍 Procurando..."}

📋 CONSULTAR AGENDA:
{"acao": "consultar_agenda", "periodo": "hoje|amanha|semana|todos", "filtro_status": "pendente|concluido", "resposta": "📅 Verificando..."}
- "minha agenda/meus compromissos" → periodo: "todos"
- "o que falta fazer" → filtro_status: "pendente"
- "eventos atrasados/tarefas pendentes" → filtro_status: "pendente"

✅ MARCAR COMO FEITO:
{"acao": "marcar_status", "busca": "palavra-chave", "novo_status": "concluido", "resposta": "🔍 Procurando..."}
- Detectar conclusão implícita: "já paguei a Rose" → busca: "Rose"

⏰ SNOOZE (adiar):
{"acao": "snooze_lembrete", "minutos": 15, "resposta": "⏰ Ok! Lembro em 15 min."}

🔁 EVENTO RECORRENTE:
{"acao": "criar_recorrente", "titulo": "...", "hora": "HH:MM", "tipo": "tarefa", "recorrencia": {"frequencia": "diario|semanal|mensal", "dias_semana": [1,3,5], "dia_mes": 15}}

📍 LOCAIS:
- Salvar: {"acao": "salvar_local", "apelido": "nome", "endereco": "..."}
- Listar: {"acao": "listar_locais"}
- Remover: {"acao": "remover_local", "apelido": "nome"}

🔔 LEMBRETE PERSISTENTE (sem horário):
{"acao": "criar_lembrete", "titulo": "...", "tipo": "lembrete", "resposta": "✅ Vou perguntar se você fez!"}

Resposta a lembrete: {"acao": "responder_lembrete", "resposta_lembrete": "sim|nao"}

💬 CONVERSA CASUAL:
{"acao": "conversar", "resposta": "resposta curta"}

🏠 ATUALIZAR ENDEREÇO:
{"acao": "atualizar_endereco", "endereco": "...", "resposta": "✅ Endereço adicionado!"}

═══ CHECKLISTS ═══

Por contexto (máx 4 itens):
- Natação/piscina: ["Sunga/maiô", "Óculos", "Toalha", "Chinelo"]
- Academia/treino: ["Roupa", "Tênis", "Toalha", "Água"]
- Consulta médica: ["RG/carteirinha", "Exames anteriores", "Medicamentos"]
- Aniversário: ["Presente?", "Cartão?"]
- Reunião: ["Materiais", "Laptop"]

═══ IMAGENS ═══

Extrair TUDO visível: nome, data, hora, endereço.
NUNCA pedir info que está na imagem!

Convite → confirmar_evento tipo "aniversario" com todos dados extraídos.
Datas passadas → usar próximo ano.
Se não conseguir ler: {"acao": "conversar", "resposta": "Não consegui ler. Me conta os detalhes?"}

═══ DATAS ═══

HOJE: ${dataHoje}
- "amanhã" = +1 dia
- "semana que vem" = +7 dias
- Formato: YYYY-MM-DD e HH:MM (24h)
- Nunca criar eventos no passado

Dias da semana: dom=0, seg=1, ter=2, qua=3, qui=4, sex=5, sab=6

RETORNE APENAS JSON VÁLIDO. LIMITE: 200 caracteres na resposta.

HISTÓRICO:
${contextoCompleto}`;

    console.log('🤖 Processando mensagem da Malu:', mensagem);

    // ═══════════════════════════════════════════════════════════
    // PARTE 1: FORÇAR PRIORIDADE DA AÇÃO PENDENTE
    // Se tem ação pendente e usuária confirma, reescrever mensagem
    // ═══════════════════════════════════════════════════════════
    let mensagemFinal = mensagem;
    let forcandoAcao = false;

    if (acoesPendentes.length > 0) {
      const msgLower = mensagem.trim().toLowerCase();
      const confirmacoes = ['sim', 'ok', 'confirmo', 'feito', 'pode', 'isso', 'pronto', '1', '2', '3', '4', '5', 's', 'confirma', 'isso mesmo', 'esse', 'é esse', 'esse mesmo'];
      const ehConfirmacao = confirmacoes.some(c => msgLower === c || msgLower.startsWith(c + ' '));
      
      if (ehConfirmacao) {
        forcandoAcao = true;
        const acaoPendente = acoesPendentes[0];
        
        // Montar instrução explícita para Claude
        let instrucao = `EXECUTAR AÇÃO PENDENTE AGORA: ${acaoPendente.acao_pendente}`;
        
        if (acaoPendente.evento_id) instrucao += ` | evento_id: ${acaoPendente.evento_id}`;
        if (acaoPendente.evento_titulo) instrucao += ` | titulo: "${acaoPendente.evento_titulo}"`;
        if (acaoPendente.nova_hora) instrucao += ` | nova_hora: ${acaoPendente.nova_hora}`;
        if (acaoPendente.nova_data) instrucao += ` | nova_data: ${acaoPendente.nova_data}`;
        if (acaoPendente.novo_status) instrucao += ` | novo_status: ${acaoPendente.novo_status}`;
        if (acaoPendente.eventos && Array.isArray(acaoPendente.eventos)) {
          instrucao += ` | eventos: ${JSON.stringify(acaoPendente.eventos)}`;
        }
        
        mensagemFinal = `[CONFIRMAÇÃO DA USUÁRIA: "${mensagem}"] → ${instrucao}`;
        console.log('[DEBUG] ⚡ FORÇANDO AÇÃO PENDENTE:', mensagemFinal);
      }
    }

    // Preparar conteúdo da mensagem (com ou sem imagem)
    let messageContent: any;

    if (imageUrl) {
      console.log('📸 PROCESSANDO IMAGEM...');
      console.log('🔗 URL:', imageUrl);
      
      try {
        // Baixar imagem e converter para base64
        console.log('⬇️ Baixando imagem...');
        const imageResponse = await fetch(imageUrl);
        
        console.log('📡 Status download:', imageResponse.status);
        console.log('📄 Content-Type:', imageResponse.headers.get('content-type'));
        
        if (!imageResponse.ok) {
          throw new Error(`Erro ao baixar imagem: ${imageResponse.status}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        console.log('📦 Buffer size:', imageBuffer.byteLength, 'bytes');
        
        // Função para converter ArrayBuffer para base64 em chunks (suporta arquivos grandes)
        const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 8192; // Processar em chunks de 8KB
          
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          
          return btoa(binary);
        };
        
        const imageBase64 = arrayBufferToBase64(imageBuffer);
        console.log('🔐 Base64 gerado, length:', imageBase64.length);
        
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        console.log('✅ Imagem pronta! Tipo:', mimeType, '| Tamanho:', imageBuffer.byteLength, 'bytes');
        
        // Conteúdo com imagem + texto para Claude (usar mensagemFinal, não mensagem)
        messageContent = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: mensagemFinal || 'Analise esta imagem de convite/documento e extraia TODAS as informações visíveis: nome, data, hora, endereço. Crie um evento com esses dados.'
          }
        ];
        console.log('📤 Enviando para Claude com imagem...');
      } catch (imgError) {
        console.error('❌ ERRO ao processar imagem:', imgError);
        console.error('Stack:', imgError instanceof Error ? imgError.stack : 'N/A');
        // Fallback para texto apenas (usar mensagemFinal)
        messageContent = mensagemFinal;
      }
    } else {
      // Apenas texto - usar mensagemFinal (que pode ter sido reescrita)
      messageContent = mensagemFinal;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { 
            role: 'user', 
            content: messageContent
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro Anthropic:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.content.find((c: any) => c.type === 'text');
    
    if (!textContent) {
      throw new Error('Sem resposta de texto do Claude');
    }

    // ═══════════════════════════════════════════════════════════
    // DEBUG DETALHADO - RESPOSTA DO CLAUDE
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(60));
    console.log('[DEBUG] 🤖 RESPOSTA BRUTA CLAUDE:');
    console.log(textContent.text);
    console.log('='.repeat(60));

    let maluResponse: MaluResponse;
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        maluResponse = JSON.parse(jsonMatch[0]);
        
        // === LOG DETALHADO DA AÇÃO DETECTADA ===
        console.log('[DEBUG] ✅ JSON PARSEADO COM SUCESSO:');
        console.log('[DEBUG]   └─ ação:', maluResponse.acao);
        console.log('[DEBUG]   └─ busca:', maluResponse.busca || 'N/A');
        console.log('[DEBUG]   └─ titulo:', maluResponse.titulo || 'N/A');
        console.log('[DEBUG]   └─ novo_status:', maluResponse.novo_status || 'N/A');
        console.log('[DEBUG]   └─ resposta_preview:', maluResponse.resposta?.substring(0, 100) || 'N/A');
        
        if (maluResponse.acao === 'marcar_status') {
          console.log('[DEBUG] 🎯 AÇÃO MARCAR_STATUS DETECTADA!');
          console.log('[DEBUG]   └─ busca:', maluResponse.busca);
          console.log('[DEBUG]   └─ novo_status:', maluResponse.novo_status);
        }
        
      } else {
        console.log('[DEBUG] ❌ JSON NÃO ENCONTRADO NA RESPOSTA');
        throw new Error('JSON não encontrado');
      }
    } catch (parseError) {
      console.log('[DEBUG] ❌ ERRO AO PARSEAR JSON:', parseError);
      console.log('[DEBUG] Texto original:', textContent.text);
      maluResponse = {
        acao: 'conversar',
        resposta: 'Não entendi. Pode reformular?'
      };
    }

    // Limite de resposta: 350 chars para imagens, 200 para texto
    const maxLength = imageUrl ? 350 : 200;
    if (maluResponse.resposta && maluResponse.resposta.length > maxLength) {
      maluResponse.resposta = maluResponse.resposta.substring(0, maxLength - 3) + '...';
    }

    console.log('[DEBUG] 📤 RESPOSTA FINAL:', JSON.stringify(maluResponse, null, 2));
    console.log('='.repeat(60) + '\n');

    return new Response(
      JSON.stringify(maluResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // ═══════════════════════════════════════════════════════════
    // DEBUG DETALHADO - ERRO NO PROCESSAR-CONVERSA-MALU
    // ═══════════════════════════════════════════════════════════
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    
    console.error('\n' + '!'.repeat(60));
    console.error('[DEBUG] ❌ ERRO CRÍTICO NO PROCESSAR-CONVERSA-MALU');
    console.error('[DEBUG] Mensagem:', errorMessage);
    console.error('[DEBUG] Stack:', errorStack);
    console.error('[DEBUG] Erro completo:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('!'.repeat(60) + '\n');
    
    return new Response(
      JSON.stringify({ 
        acao: 'conversar',
        resposta: 'Erro temporário. Tente novamente.'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
