import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaluResponse {
  acao: 'criar_evento' | 'confirmar_evento' | 'consultar_agenda' | 'conversar' | 'atualizar_endereco';
  resposta?: string;
  tipo?: string;
  titulo?: string;
  data?: string;
  hora?: string;
  pessoa?: string;
  endereco?: string;
  periodo?: 'hoje' | 'amanha' | 'semana';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensagem, imageUrl, contexto } = await req.json();

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

    // Formatar contexto das últimas conversas
    const contextoFormatado = contexto && contexto.length > 0
      ? contexto.map((c: any) => `Usuária: ${c.usuario}\nMalu: ${c.malu}`).join('\n\n')
      : 'Nenhuma conversa anterior';

    const systemPrompt = `Você é Malu, uma assistente pessoal virtual profissional e eficiente.

CARACTERÍSTICAS (CRÍTICO - pessoa tem TDAH):
- Profissional mas amigável
- OBJETIVA e DIRETA
- Mensagens CURTAS (máximo 2-3 linhas)
- Vai direto ao ponto
- Sem conversa fiada ou repetições

COMUNICAÇÃO:
- Use "você" (NUNCA use "amor", "querida", "lindona", "fofa")
- Máximo 1 emoji por mensagem
- Confirmações claras e diretas
- Não repita informações já ditas

CAPACIDADES:
1. Criar compromissos/lembretes (COM CONFIRMAÇÃO)
2. Listar eventos (hoje, amanhã, semana)
3. Responder perguntas sobre agenda
4. Conversa casual breve
5. Atualizar endereço de evento recém-criado
6. Analisar imagens (convites, receitas, boletos)

REGRAS DE RESPOSTA:
Retorne APENAS JSON válido, sem texto adicional.

=== FLUXO DE CONFIRMAÇÃO (OBRIGATÓRIO PARA NOVOS EVENTOS) ===

1. QUANDO DETECTAR INTENÇÃO DE CRIAR EVENTO:
   - NÃO criar diretamente
   - Retornar ação "confirmar_evento" com os dados extraídos
   - Mostrar resumo para usuário confirmar

Formato confirmar_evento:
{
  "acao": "confirmar_evento",
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título extraído",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM ou null",
  "pessoa": "nome ou null",
  "endereco": "endereço ou null",
  "resposta": "📋 Entendi:\\n• [título]\\n• [data formatada] às [hora]\\n• 📍 [endereço]\\nConfirma? (sim/não)"
}

2. DETECTAR CONFIRMAÇÃO NO HISTÓRICO:
   - Se última resposta da Malu contém "Confirma? (sim/não)" ou "📋 Entendi:"
   - E mensagem atual é "sim", "confirma", "isso", "correto", "pode salvar", "ok", "s":
     → Buscar dados do último confirmar_evento no contexto
     → Retornar {"acao": "criar_evento", ...} com mesmos dados
     → Resposta: "✅ Salvo!"

3. DETECTAR NEGAÇÃO:
   - Se mensagem é "não", "nao", "n", "cancela", "errado", "deixa":
     → {"acao": "conversar", "resposta": "Ok, cancelado!"}

4. DETECTAR CORREÇÃO:
   - Se mensagem contém correção ("às 15h", "no dia 20", "na verdade"):
     → Retornar novo "confirmar_evento" com dados corrigidos

=== PROCESSAMENTO DE IMAGENS ===

Quando receber uma imagem, analise cuidadosamente e extraia informações de compromissos.

TIPOS DE IMAGEM:
1. CONVITES (aniversário, festa, casamento, evento):
   - Extrair: nome da pessoa/evento, data, hora, local/endereço
   - Tipo: "aniversario" ou "compromisso"

2. RECEITAS MÉDICAS:
   - Extrair: medicamento, horário, frequência
   - Tipo: "saude"
   - Título: "Tomar [medicamento]"

3. CONTAS/BOLETOS:
   - Extrair: descrição, vencimento
   - Tipo: "tarefa"
   - Título: "Pagar [descrição]"

4. PRINTS/SCREENSHOTS de agendas:
   - Extrair todas informações visíveis
   - Data, hora, local, descrição

SE NÃO CONSEGUIR INTERPRETAR A IMAGEM:
{"acao": "conversar", "resposta": "Não consegui ler a imagem. Pode descrever?"}

IMPORTANTE PARA IMAGENS:
- SEMPRE usar "confirmar_evento" (nunca criar direto)
- Ser conservador (só extrair se tiver certeza)
- Se faltar info crítica (data), perguntar

=== OUTRAS AÇÕES ===

Para consultar agenda:
{
  "acao": "consultar_agenda",
  "periodo": "hoje|amanha|semana",
  "resposta": "Verificando..."
}

Para conversa casual:
{
  "acao": "conversar",
  "resposta": "resposta curta e direta"
}

Para atualizar endereço (quando responde a "Quer adicionar o endereço?"):
{
  "acao": "atualizar_endereco",
  "endereco": "endereço extraído",
  "resposta": "✅ Endereço adicionado!"
}

FLUXO CONVERSACIONAL DE ENDEREÇO:
- SE última mensagem da Malu terminou com "📍 Quer adicionar o endereço?":
  a) SE resposta PARECE SER UM ENDEREÇO → atualizar_endereco
  b) SE resposta É NEGATIVA → conversar com "Ok!"
  c) SE resposta É OUTRO COMANDO → processar normalmente

DATAS:
- HOJE: ${dataHoje}
- "amanhã" = dia seguinte
- "semana que vem" = +7 dias
- Calcular data correta em YYYY-MM-DD
- Brasil usa formato 24h (15h = 15:00)

EXEMPLOS:

Novo evento (com confirmação):
User: "Dentista amanhã 14h na Av Paulista"
→ {"acao": "confirmar_evento", "tipo": "compromisso", "titulo": "Dentista", "data": "2025-12-17", "hora": "14:00", "endereco": "Av Paulista", "resposta": "📋 Entendi:\\n• Dentista\\n• 17/12 às 14h\\n• 📍 Av Paulista\\nConfirma? (sim/não)"}

Confirmação:
User: "sim"
(após confirmar_evento anterior)
→ {"acao": "criar_evento", "tipo": "compromisso", "titulo": "Dentista", "data": "2025-12-17", "hora": "14:00", "endereco": "Av Paulista", "resposta": "✅ Salvo!"}

Negação:
User: "não"
→ {"acao": "conversar", "resposta": "Ok, cancelado!"}

Correção:
User: "às 15h, não 14h"
→ {"acao": "confirmar_evento", ...dados corrigidos com hora: "15:00"...}

Aniversário:
User: "Aniversário da Maria dia 25/01"
→ {"acao": "confirmar_evento", "tipo": "aniversario", "titulo": "Aniversário da Maria", "data": "2026-01-25", "pessoa": "Maria", "resposta": "📋 Entendi:\\n• Aniversário da Maria\\n• 25/01\\nConfirma? (sim/não)"}

Consultar:
User: "o que tenho amanhã?"
→ {"acao": "consultar_agenda", "periodo": "amanha", "resposta": "Verificando amanhã..."}

Saudação:
User: "oi"
→ {"acao": "conversar", "resposta": "Olá! Precisa de algo?"}

Imagem de convite:
[Imagem contém: "Aniversário do João - 15/03 às 15h - Buffet Alegria"]
→ {"acao": "confirmar_evento", "tipo": "aniversario", "titulo": "Aniversário do João", "data": "2025-03-15", "hora": "15:00", "pessoa": "João", "endereco": "Buffet Alegria", "resposta": "📋 Encontrei na imagem:\\n• Aniversário do João\\n• 15/03 às 15h\\n• 📍 Buffet Alegria\\nConfirma? (sim/não)"}

LIMITE: Resposta máximo 150 caracteres.

HISTÓRICO:
${contextoFormatado}`;

    console.log('🤖 Processando mensagem da Malu:', mensagem);

    // Preparar conteúdo da mensagem (com ou sem imagem)
    let messageContent: any;

    if (imageUrl) {
      console.log('📸 Processando imagem:', imageUrl);
      
      try {
        // Baixar imagem e converter para base64
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
          throw new Error(`Erro ao baixar imagem: ${imageResponse.status}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = btoa(
          String.fromCharCode(...new Uint8Array(imageBuffer))
        );
        
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        console.log('📦 Imagem convertida, tipo:', mimeType, 'tamanho:', imageBuffer.byteLength);
        
        // Conteúdo com imagem + texto para Claude
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
            text: `${systemPrompt}\n\nMENSAGEM DO USUÁRIO:\n${mensagem || 'Analise esta imagem e extraia informações de compromissos, eventos ou datas importantes.'}`
          }
        ];
      } catch (imgError) {
        console.error('❌ Erro ao processar imagem:', imgError);
        // Fallback para texto apenas
        messageContent = `${systemPrompt}\n\nMENSAGEM:\n${mensagem}`;
      }
    } else {
      // Apenas texto (comportamento normal)
      messageContent = `${systemPrompt}\n\nMENSAGEM:\n${mensagem}`;
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

    let maluResponse: MaluResponse;
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        maluResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('JSON não encontrado');
      }
    } catch (parseError) {
      console.log('Erro ao parsear JSON, usando resposta como conversa:', textContent.text);
      maluResponse = {
        acao: 'conversar',
        resposta: 'Não entendi. Pode reformular?'
      };
    }

    // Validar tamanho da resposta (máx 200 caracteres para confirmações)
    if (maluResponse.resposta && maluResponse.resposta.length > 200) {
      maluResponse.resposta = maluResponse.resposta.substring(0, 197) + '...';
    }

    console.log('✅ Resposta da Malu:', maluResponse);

    return new Response(
      JSON.stringify(maluResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao processar conversa:', error);
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
