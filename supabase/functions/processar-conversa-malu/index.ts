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
  checklist?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensagem, imageUrl, contexto } = await req.json();

    // === LOG DE INPUT (DEBUG CRÍTICO) ===
    console.log('📥 INPUT RECEBIDO:', { 
      temMensagem: !!mensagem, 
      mensagem: mensagem?.substring(0, 100),
      temImageUrl: !!imageUrl,
      imageUrlPreview: imageUrl?.substring(0, 80),
      contextoLength: contexto?.length || 0
    });

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

=== CHECKLISTS AUTOMÁTICOS (30 MIN ANTES) ===

Ao criar ou confirmar evento, SEMPRE gere checklist de itens necessários baseado no contexto.
Máximo 4 itens. Itens práticos e acionáveis.

TEMPLATES POR CONTEXTO:

NATAÇÃO/PISCINA (título com "natação", "piscina", "nado"):
- checklist: ["Sunga/maiô", "Óculos de natação", "Toalha", "Chinelo"]

ACADEMIA/TREINO ("academia", "crossfit", "treino", "musculação"):
- checklist: ["Roupa de treino", "Tênis", "Toalha", "Garrafa de água"]

CONSULTAS MÉDICAS ("consulta", "médico", "exame", especialidades):
- checklist: ["RG e carteirinha", "Exames anteriores", "Lista de medicamentos"]
- Se cardiologista: adicionar "ECG anterior"
- Se dermatologista: adicionar "Fotos de lesões"

ANIVERSÁRIOS ("aniversário"):
- checklist: ["Presente comprado?", "Cartão/mensagem", "Endereço confirmado?"]

VIAGENS ("viagem", "aeroporto", "voo"):
- checklist: ["Documentos (RG/passaporte)", "Passagens", "Malas prontas", "Carregadores"]

REUNIÕES/TRABALHO ("reunião", "apresentação", "entrevista"):
- checklist: ["Materiais/documentos", "Laptop carregado", "Agenda/anotações"]

ESCOLA/AULA DAS CRIANÇAS ("escola", "aula", "curso", "natação"):
- checklist: ["Mochila/material", "Lanche", "Roupa adequada"]

Se não houver itens óbvios: checklist: []

=== FLUXO DE CONFIRMAÇÃO (OBRIGATÓRIO PARA NOVOS EVENTOS) ===

1. QUANDO DETECTAR INTENÇÃO DE CRIAR EVENTO:
   - NÃO criar diretamente
   - Retornar ação "confirmar_evento" com dados + checklist
   - Mostrar resumo para usuário confirmar

Formato confirmar_evento COM CHECKLIST:
{
  "acao": "confirmar_evento",
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título extraído",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM ou null",
  "pessoa": "nome ou null",
  "endereco": "endereço ou null",
  "checklist": ["item1", "item2", "item3"],
  "resposta": "📋 Entendi:\\n• [título]\\n• [data] às [hora]\\n\\n📋 Vou lembrar:\\n□ item1\\n□ item2\\n\\nConfirma?"
}

2. DETECTAR CONFIRMAÇÃO NO HISTÓRICO:
   - Se última resposta da Malu contém "Confirma?" ou "📋 Entendi:"
   - E mensagem atual é "sim", "confirma", "isso", "correto", "pode salvar", "ok", "s":
     → Buscar dados do último confirmar_evento no contexto (incluindo checklist)
     → Retornar {"acao": "criar_evento", ...} com mesmos dados
     → Resposta: "✅ Salvo!"

3. DETECTAR NEGAÇÃO:
   - Se mensagem é "não", "nao", "n", "cancela", "errado", "deixa":
     → {"acao": "conversar", "resposta": "Ok, cancelado!"}

4. DETECTAR CORREÇÃO:
   - Se mensagem contém correção ("às 15h", "no dia 20", "na verdade"):
     → Retornar novo "confirmar_evento" com dados corrigidos

=== RESPOSTA DE CHECKLIST ===

Se o histórico mostra que a última mensagem da Malu continha "📋 Já pegou:" ou "Tudo pronto?":
- "sim", "pronto", "tudo certo", "peguei tudo" → {"acao": "conversar", "resposta": "👍 Ótimo! Bom compromisso!"}
- "falta [item]", "esqueci [item]" → {"acao": "conversar", "resposta": "Pegue [item] agora! 📄"}
- outro assunto → processar normalmente

=== PROCESSAMENTO DE IMAGENS - CRÍTICO ===

Quando receber uma imagem, você DEVE:
1. ANALISAR CUIDADOSAMENTE TODO o texto visível na imagem
2. EXTRAIR TODAS as informações encontradas (nome, data, hora, endereço)
3. NUNCA pedir informações que estão VISÍVEIS na imagem!

PARA CONVITES DE ANIVERSÁRIO/FESTA:
- Extrair NOME da pessoa/criança (busque palavras em destaque)
- Extrair DATA COMPLETA (dia e mês, assumir próximo ano se necessário)  
- Extrair HORÁRIO EXATO (ex: "13 HORAS" = 13:00, "15H" = 15:00)
- Extrair ENDEREÇO COMPLETO (rua, número, bairro, cidade)
- Tipo: "aniversario"
- Gerar checklist: ["Presente comprado?", "Cartão/mensagem", "Endereço confirmado?"]

FORMATO OBRIGATÓRIO PARA IMAGEM DE CONVITE:
{
  "acao": "confirmar_evento",
  "tipo": "aniversario",
  "titulo": "Aniversário da [NOME EXTRAÍDO DA IMAGEM]",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM",
  "pessoa": "[NOME]",
  "endereco": "[ENDEREÇO COMPLETO DA IMAGEM]",
  "checklist": ["Presente comprado?", "Cartão/mensagem"],
  "resposta": "📋 Vi no convite:\\n• Aniversário da [NOME]\\n• [DATA] às [HORA]\\n• 📍 [ENDEREÇO]\\n\\nConfirma?"
}

OUTROS TIPOS DE IMAGEM:
1. RECEITAS MÉDICAS → tipo: "saude", extrair medicamento/horário
2. CONTAS/BOLETOS → tipo: "tarefa", extrair descrição/vencimento

IMPORTANTE: Se a data/hora/endereço estão na imagem, EXTRAIA-OS!
Não pergunte "qual a data?" se ela está visível no convite.

SE NÃO CONSEGUIR LER A IMAGEM:
{"acao": "conversar", "resposta": "Não consegui ler bem. Pode me dizer os detalhes?"}

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

Para atualizar endereço:
{
  "acao": "atualizar_endereco",
  "endereco": "endereço extraído",
  "resposta": "✅ Endereço adicionado!"
}

DATAS:
- HOJE: ${dataHoje}
- "amanhã" = dia seguinte
- "semana que vem" = +7 dias
- Calcular data correta em YYYY-MM-DD
- Brasil usa formato 24h (15h = 15:00)

EXEMPLOS:

Natação (com checklist):
User: "Natação das crianças terça 16h"
→ {"acao": "confirmar_evento", "tipo": "compromisso", "titulo": "Natação das crianças", "data": "2025-12-17", "hora": "16:00", "checklist": ["Sunga/maiô", "Óculos de natação", "Toalha", "Chinelo"], "resposta": "📋 Entendi:\\n• Natação das crianças\\n• 17/12 às 16h\\n\\n📋 Vou lembrar:\\n□ Sunga/maiô\\n□ Óculos\\n□ Toalha\\n□ Chinelo\\n\\nConfirma?"}

Consulta médica:
User: "Consulta cardiologista amanhã 9h"
→ {"acao": "confirmar_evento", "tipo": "saude", "titulo": "Consulta cardiologista", "data": "2025-12-17", "hora": "09:00", "checklist": ["RG e carteirinha", "Exames anteriores", "Lista de medicamentos", "ECG recente"], "resposta": "📋 Entendi:\\n• Consulta cardiologista\\n• 17/12 às 9h\\n\\n📋 Vou lembrar:\\n□ RG/carteirinha\\n□ Exames\\n□ Medicamentos\\n□ ECG\\n\\nConfirma?"}

Confirmação:
User: "sim"
→ {"acao": "criar_evento", "tipo": "compromisso", "titulo": "Natação das crianças", "data": "2025-12-17", "hora": "16:00", "checklist": ["Sunga/maiô", "Óculos de natação", "Toalha", "Chinelo"], "resposta": "✅ Salvo!"}

Aniversário:
User: "Aniversário da Maria dia 25/01"
→ {"acao": "confirmar_evento", "tipo": "aniversario", "titulo": "Aniversário da Maria", "data": "2026-01-25", "pessoa": "Maria", "checklist": ["Presente comprado?", "Cartão/mensagem"], "resposta": "📋 Entendi:\\n• Aniversário da Maria\\n• 25/01\\n\\n📋 Lembrete:\\n□ Presente?\\n□ Cartão?\\n\\nConfirma?"}

LIMITE: Resposta máximo 200 caracteres.

HISTÓRICO:
${contextoFormatado}`;

    console.log('🤖 Processando mensagem da Malu:', mensagem);

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
        
        const imageBase64 = btoa(
          String.fromCharCode(...new Uint8Array(imageBuffer))
        );
        console.log('🔐 Base64 gerado, length:', imageBase64.length);
        
        const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
        console.log('✅ Imagem pronta! Tipo:', mimeType, '| Tamanho:', imageBuffer.byteLength, 'bytes');
        
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
            text: `${systemPrompt}\n\nMENSAGEM DO USUÁRIO:\n${mensagem || 'Analise esta imagem de convite/documento e extraia TODAS as informações visíveis: nome, data, hora, endereço. Crie um evento com esses dados.'}`
          }
        ];
        console.log('📤 Enviando para Claude com imagem...');
      } catch (imgError) {
        console.error('❌ ERRO ao processar imagem:', imgError);
        console.error('Stack:', imgError instanceof Error ? imgError.stack : 'N/A');
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

    // === LOG DA RESPOSTA BRUTA DO CLAUDE ===
    console.log('🤖 RESPOSTA BRUTA CLAUDE:', textContent.text);

    let maluResponse: MaluResponse;
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        maluResponse = JSON.parse(jsonMatch[0]);
        console.log('📝 JSON PARSEADO:', JSON.stringify(maluResponse, null, 2));
      } else {
        throw new Error('JSON não encontrado');
      }
    } catch (parseError) {
      console.log('❌ Erro ao parsear JSON:', textContent.text);
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

    console.log('✅ Resposta FINAL da Malu:', maluResponse);

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
