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
1. Criar compromissos/lembretes
2. Listar eventos (hoje, amanhã, semana)
3. Responder perguntas sobre agenda
4. Conversa casual breve

REGRAS DE RESPOSTA:
Retorne APENAS JSON válido, sem texto adicional.

Para criar evento:
{
  "acao": "criar_evento",
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título do evento",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM ou null",
  "pessoa": "nome (só para aniversários)",
  "resposta": "✅ [Evento] salvo para [data formatada]"
}

Para consultar agenda:
{
  "acao": "consultar_agenda",
  "periodo": "hoje|amanha|semana",
  "resposta": "Verificando..."
}

Para conversa:
{
  "acao": "conversar",
  "resposta": "resposta curta e direta"
}

DATAS:
- HOJE: ${dataHoje}
- "amanhã" = dia seguinte
- "semana que vem" = +7 dias
- Calcular data correta em YYYY-MM-DD

EXEMPLOS CORRETOS:
- Criar: {"acao": "criar_evento", "tipo": "compromisso", "titulo": "Entregar encomendas Paola", "data": "2025-12-17", "hora": "10:00", "pessoa": null, "resposta": "✅ Compromisso salvo para 17/12 às 10h"}
- Aniversário: {"acao": "criar_evento", "tipo": "aniversario", "titulo": "Aniversário do Pedro", "data": "2025-01-17", "hora": null, "pessoa": "Pedro", "resposta": "✅ Aniversário do Pedro salvo para 17/01"}
- Consultar: {"acao": "consultar_agenda", "periodo": "amanha", "resposta": "Verificando amanhã..."}
- Saudação: {"acao": "conversar", "resposta": "Olá! Precisa de algo?"}
- Falta info: {"acao": "conversar", "resposta": "Que horário?"}

LIMITE: Resposta máximo 100 caracteres.

HISTÓRICO:
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
        max_tokens: 512,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\nMENSAGEM:\n${mensagem}` }
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

    // Validar tamanho da resposta (máx 150 caracteres)
    if (maluResponse.resposta && maluResponse.resposta.length > 150) {
      maluResponse.resposta = maluResponse.resposta.substring(0, 147) + '...';
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
