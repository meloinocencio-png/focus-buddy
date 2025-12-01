import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ComandoRequest {
  texto: string;
  userId: string;
}

interface EventoExtracted {
  tipo: "aniversario" | "compromisso" | "tarefa" | "saude";
  titulo: string;
  descricao: string;
  data: string;
  hora: string | null;
  pessoa: string | null;
  lembretes: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texto, userId }: ComandoRequest = await req.json();
    
    if (!texto || !userId) {
      return new Response(
        JSON.stringify({ error: 'Texto e userId são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[processar-comando] Processando texto:', texto);

    // Obter data atual para o prompt
    const dataAtual = new Date().toISOString().split('T')[0];
    
    const systemPrompt = `Você extrai informações de comandos de voz em português brasileiro para criar lembretes.
Retorne APENAS um objeto JSON válido, sem blocos de código markdown, sem texto adicional, sem explicações.

Formato exato:
{
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título curto e claro",
  "descricao": "descrição detalhada",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM" (opcional, null se não mencionado),
  "pessoa": "nome completo" (só para aniversários),
  "lembretes": ["30d", "7d", "3d", "1d", "0d"]
}

Exemplos:
- 'marcar aniversário do João dia 15 de março' → tipo: aniversario, pessoa: João, data: 2025-03-15
- 'consulta médica amanhã às 14h' → tipo: saude, data: amanhã, hora: 14:00
- 'comprar remédio daqui 3 dias' → tipo: tarefa, data: +3 dias

Se a data for relativa (amanhã, semana que vem), calcule a data absoluta.
Hoje é ${dataAtual}.

IMPORTANTE: Retorne apenas o JSON, sem markdown, sem \`\`\`json, sem texto extra.`;

    // Chamar Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: texto
          }
        ],
        system: systemPrompt
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('[processar-comando] Erro na API Claude:', errorText);
      throw new Error(`Erro na API Claude: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('[processar-comando] Resposta Claude:', JSON.stringify(claudeData));

    // Extrair o texto da resposta
    let contentText = claudeData.content[0].text;
    
    // Remover blocos markdown se existirem
    contentText = contentText.trim();
    if (contentText.startsWith('```json')) {
      contentText = contentText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (contentText.startsWith('```')) {
      contentText = contentText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }
    contentText = contentText.trim();
    
    // Parsear JSON da resposta
    let eventoData: EventoExtracted;
    try {
      eventoData = JSON.parse(contentText);
    } catch (parseError) {
      console.error('[processar-comando] Erro ao parsear JSON:', contentText);
      throw new Error('Não consegui entender o comando. Pode repetir de forma mais clara?');
    }

    console.log('[processar-comando] Evento extraído:', eventoData);

    // Validar campos obrigatórios
    if (!eventoData.tipo || !eventoData.titulo || !eventoData.data) {
      throw new Error('Faltam informações no comando. Pode especificar melhor?');
    }

    // Construir timestamp com data e hora
    let dataTimestamp = eventoData.data;
    if (eventoData.hora) {
      dataTimestamp = `${eventoData.data}T${eventoData.hora}:00`;
    } else {
      dataTimestamp = `${eventoData.data}T12:00:00`;
    }

    // Calcular datas dos lembretes baseado na data do evento
    const eventDate = new Date(dataTimestamp);
    const lembretes = eventoData.lembretes.map(intervalo => {
      const dias = parseInt(intervalo.replace('d', ''));
      const lembrete = new Date(eventDate);
      lembrete.setDate(lembrete.getDate() - dias);
      return lembrete.toISOString();
    });

    // Salvar no Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: evento, error: dbError } = await supabase
      .from('eventos')
      .insert({
        usuario_id: userId,
        tipo: eventoData.tipo,
        titulo: eventoData.titulo,
        descricao: eventoData.descricao,
        data: dataTimestamp,
        pessoa: eventoData.pessoa,
        lembretes: lembretes
      })
      .select()
      .single();

    if (dbError) {
      console.error('[processar-comando] Erro ao salvar no banco:', dbError);
      throw new Error('Erro ao salvar evento');
    }

    console.log('[processar-comando] Evento salvo com sucesso:', evento);

    return new Response(
      JSON.stringify({ 
        success: true, 
        evento: {
          id: evento.id,
          tipo: evento.tipo,
          titulo: evento.titulo,
          data: evento.data,
          pessoa: evento.pessoa
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('[processar-comando] Erro:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro ao processar comando',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
