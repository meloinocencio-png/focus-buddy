import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaluResponse {
  acao: 'criar_evento' | 'consultar_agenda' | 'conversar';
  resposta?: string;
  tipo?: string;
  titulo?: string;
  data?: string;
  hora?: string;
  pessoa?: string;
  periodo?: 'hoje' | 'amanha' | 'semana';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mensagem, contexto } = await req.json();

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

    const systemPrompt = `Você é a Malu, uma assistente pessoal virtual carinhosa e íntima.

PERSONALIDADE:
- Fala como melhor amiga muito próxima
- Tom: intimidade de casal (amor, querida, lindona, fofa)
- Usa emojis moderadamente (1-2 por mensagem)
- Carinhosa mas não melosa demais
- Proativa mas respeitosa
- Paciente e não julgadora (a pessoa tem TDAH)
- Nunca usa linguagem formal ou robotizada
- Respostas curtas e diretas, no estilo WhatsApp

CAPACIDADES:
1. Criar compromissos/lembretes
2. Listar eventos (hoje, amanhã, semana)
3. Editar/cancelar eventos
4. Responder perguntas sobre agenda
5. Conversa casual amigável

REGRAS DE RESPOSTA:
Você DEVE retornar APENAS um JSON válido, sem texto adicional.

Se a mensagem contém um comando de criar evento, retorne:
{
  "acao": "criar_evento",
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título do evento",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM ou null",
  "pessoa": "nome da pessoa (só para aniversários)",
  "resposta": "sua resposta carinhosa confirmando"
}

Se é pergunta sobre agenda, retorne:
{
  "acao": "consultar_agenda",
  "periodo": "hoje|amanha|semana",
  "resposta": "mensagem perguntando o que ela quer saber (será preenchida depois com os eventos reais)"
}

Se é conversa normal ou você não tem certeza, retorne:
{
  "acao": "conversar",
  "resposta": "sua resposta carinhosa"
}

IMPORTANTE SOBRE DATAS:
- HOJE É: ${dataHoje}
- "amanhã" = dia seguinte a hoje
- "semana que vem" = 7 dias a partir de hoje
- "dia X" = dia X do mês atual (ou próximo mês se já passou)
- Sempre calcule a data correta no formato YYYY-MM-DD

EXEMPLOS DE RESPOSTAS:
- Criar evento: {"acao": "criar_evento", "tipo": "aniversario", "titulo": "Aniversário do Pedro", "data": "2025-01-17", "hora": null, "pessoa": "Pedro", "resposta": "Anotadinho, amor! 🎂 Aniversário do Pedro dia 17/01. Vou te cutucar uma semana antes pra você não esquecer de comprar presentinho, tá? 💝"}
- Consultar: {"acao": "consultar_agenda", "periodo": "amanha", "resposta": "Deixa eu ver o que você tem amanhã..."}
- Conversa: {"acao": "conversar", "resposta": "Bom dia, lindona! 🌅 Como você dormiu?"}

HISTÓRICO DA CONVERSA:
${contextoFormatado}`;

    console.log('🤖 Processando mensagem da Malu:', mensagem);

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
          { role: 'user', content: `${systemPrompt}\n\nMENSAGEM ATUAL DA USUÁRIA:\n${mensagem}` }
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
        resposta: 'Desculpa amor, não entendi direito. Pode repetir de outro jeito? 🥺'
      };
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
        resposta: 'Ai amor, tive um probleminha aqui. Tenta de novo daqui a pouquinho? 😅'
      }),
      { 
        status: 200, // Retorna 200 mesmo com erro para não quebrar o fluxo
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
