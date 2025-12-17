import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { corsHeaders } from "../_shared/utils.ts";

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
    const dataAtual = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const systemPrompt = `Você extrai informações de comandos de voz em português brasileiro para criar lembretes.
Retorne APENAS um objeto JSON válido, sem blocos de código markdown, sem texto adicional, sem explicações.

IMPORTANTE - HORÁRIOS:
- Brasil usa formato 24 horas
- '15 horas' = '15:00' (NÃO 12:00 ou 3:00)
- '8 da manhã' = '08:00'
- '2 da tarde' = '14:00'
- '8 da noite' = '20:00'
- '10h30' = '10:30'
- Se mencionar apenas hora sem minutos, sempre usar ':00'
- SEMPRE retornar hora no formato 'HH:MM' (24h)

IMPORTANTE - DATAS:
- Hoje é ${dataAtual}
- 'amanhã' = hoje + 1 dia
- 'semana que vem' = hoje + 7 dias
- Se mencionar dia da semana (segunda, terça, etc), calcular próxima ocorrência
- SEMPRE retornar data no formato 'YYYY-MM-DD'

Formato exato de retorno:
{
  "tipo": "aniversario|compromisso|tarefa|saude",
  "titulo": "título curto e claro",
  "descricao": "descrição completa do que foi dito",
  "data": "YYYY-MM-DD",
  "hora": "HH:MM" ou null,
  "pessoa": "nome completo" (apenas para aniversários),
  "lembretes": ["30d", "7d", "3d", "1d", "0d"]
}

Exemplos:
1. 'consulta médica sexta-feira às 15 horas'
   → {"tipo": "saude", "titulo": "Consulta médica", "descricao": "Consulta médica agendada", "data": "2025-12-06", "hora": "15:00", "pessoa": null, "lembretes": ["30d", "7d", "3d", "1d", "0d"]}

2. 'aniversário do João dia 15 de março'
   → {"tipo": "aniversario", "titulo": "Aniversário do João", "descricao": "Aniversário de João", "data": "2026-03-15", "hora": null, "pessoa": "João", "lembretes": ["30d", "7d", "3d", "1d", "0d"]}

3. 'comprar remédio amanhã às 9 da manhã'
   → {"tipo": "tarefa", "titulo": "Comprar remédio", "descricao": "Comprar remédio", "data": "2025-12-02", "hora": "09:00", "pessoa": null, "lembretes": ["30d", "7d", "3d", "1d", "0d"]}

4. 'reunião às 14h30 na terça'
   → {"tipo": "compromisso", "titulo": "Reunião", "descricao": "Reunião agendada", "data": "2025-12-03", "hora": "14:30", "pessoa": null, "lembretes": ["30d", "7d", "3d", "1d", "0d"]}

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
    console.log('[processar-comando] Resposta Claude (completa):', JSON.stringify(claudeData));

    // Extrair o texto da resposta
    let contentText = claudeData.content[0].text;
    console.log('[processar-comando] Texto bruto da resposta:', contentText);
    
    // Remover blocos markdown se existirem
    contentText = contentText.trim();
    if (contentText.startsWith('```json')) {
      contentText = contentText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (contentText.startsWith('```')) {
      contentText = contentText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }
    contentText = contentText.trim();
    console.log('[processar-comando] Texto após limpeza:', contentText);
    
    // Parsear JSON da resposta
    let eventoData: EventoExtracted;
    try {
      eventoData = JSON.parse(contentText);
      console.log('[processar-comando] Evento extraído:', JSON.stringify(eventoData));
    } catch (parseError) {
      console.error('[processar-comando] Erro ao parsear JSON:', contentText);
      throw new Error('Não consegui entender o comando. Pode repetir de forma mais clara?');
    }

    // Validar campos obrigatórios
    if (!eventoData.tipo || !eventoData.titulo || !eventoData.data) {
      throw new Error('Faltam informações no comando. Pode especificar melhor?');
    }

    // Validar formato de hora se fornecida
    if (eventoData.hora) {
      const horaRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
      if (!horaRegex.test(eventoData.hora)) {
        console.error('[processar-comando] Formato de hora inválido:', eventoData.hora);
        throw new Error('Formato de hora inválido. Use HH:MM no formato 24h.');
      }
    }

    // Construir timestamp com data e hora
    let dataTimestamp = eventoData.data;
    if (eventoData.hora) {
      dataTimestamp = `${eventoData.data}T${eventoData.hora}:00`;
      console.log('[processar-comando] Timestamp com hora:', dataTimestamp);
    } else {
      dataTimestamp = `${eventoData.data}T12:00:00`;
      console.log('[processar-comando] Timestamp sem hora (padrão 12:00):', dataTimestamp);
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
