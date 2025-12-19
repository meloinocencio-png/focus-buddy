import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, calcularProximoIntervaloSimples, formatarHoraBRT } from "../_shared/utils.ts";

// Função para gerar mensagem variada baseada no tipo e tentativas
function gerarMensagemFollowup(evento: any, tentativas: number, dataEvento: Date): string {
  const horaFormatada = formatarHoraBRT(dataEvento);
  
  // Se é compromisso (tinha hora específica) - tipo !== 'lembrete'
  if (evento.tipo !== 'lembrete') {
    if (tentativas === 0) {
      return `👋 E aí? Conseguiu fazer?\n\n📝 ${evento.titulo}\n⏰ Era às ${horaFormatada}`;
    } else if (tentativas === 1) {
      return `E esse compromisso? Conseguiu?\n\n📝 ${evento.titulo}`;
    } else if (tentativas === 2) {
      return `Ainda precisa fazer?\n\n📝 ${evento.titulo}`;
    } else {
      return `Lembrete: você ainda tem pendente\n\n📝 ${evento.titulo}`;
    }
  }
  
  // Lembrete sem hora (comportamento original)
  if (tentativas === 0) {
    return `👋 E aí? Já fez isso?\n\n📝 ${evento.titulo}`;
  } else if (tentativas === 1) {
    return `👋 Conseguiu fazer?\n\n📝 ${evento.titulo}`;
  } else if (tentativas === 2) {
    return `👋 E esse lembrete?\n\n📝 ${evento.titulo}`;
  } else {
    const diasPassados = Math.floor(
      (new Date().getTime() - new Date(evento.criado_em || evento.data).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `☀️ Bom dia!\n\n📝 Lembra disso? (dia ${diasPassados})\n${evento.titulo}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔔 Processando follow-ups de lembretes...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const agora = new Date();
    
    // Buscar lembretes que precisam de follow-up (inclui data e STATUS do evento)
    // CRÍTICO: Incluir status para filtrar eventos já concluídos
    const { data: followups, error: fetchError } = await supabase
      .from('lembretes_followup')
      .select(`
        *,
        eventos!inner(id, titulo, tipo, data, criado_em, status)
      `)
      .eq('ativo', true)
      .eq('concluido', false)
      .lte('proxima_pergunta', agora.toISOString())
      .limit(50);
    
    if (fetchError) {
      console.error('Erro ao buscar follow-ups:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📋 ${followups?.length || 0} lembretes para processar`);
    
    if (!followups || followups.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'ok',
        processados: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Configuração Z-API
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      console.error('❌ Z-API não configurada');
      return new Response(JSON.stringify({ error: 'Z-API não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    let enviados = 0;
    
    for (const followup of followups) {
      try {
        const evento = followup.eventos as any;
        
        // ═══════════════════════════════════════════════════════════
        // FILTRAR: Não enviar follow-up para eventos já CONCLUÍDOS
        // ═══════════════════════════════════════════════════════════
        if (evento.status === 'concluido') {
          console.log(`⏭️ Pulando follow-up (evento já concluído): ${evento.titulo}`);
          
          // Marcar follow-up como concluído também
          await supabase
            .from('lembretes_followup')
            .update({ concluido: true, ativo: false })
            .eq('id', followup.id);
          
          continue;
        }
        
        const dataEvento = new Date(evento.data);
        
        // Gerar mensagem variada usando função helper
        const mensagem = gerarMensagemFollowup(evento, followup.tentativas, dataEvento);
        
        // Enviar via Z-API
        const zapiResponse = await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Client-Token': ZAPI_CLIENT_TOKEN || ''
            },
            body: JSON.stringify({
              phone: followup.whatsapp,
              message: mensagem
            })
          }
        );
        
        if (zapiResponse.ok) {
          // Calcular próximo intervalo usando função compartilhada
          const novoIntervalo = calcularProximoIntervaloSimples(followup.tentativas);
          const proximaPergunta = new Date();
          proximaPergunta.setMinutes(proximaPergunta.getMinutes() + novoIntervalo);
          
          // Verificar se passou do limite de dias ou tentativas
          const dataLimite = new Date(followup.data_limite);
          const maxTentativas = followup.max_tentativas || 10;
          
          if (proximaPergunta > dataLimite || (followup.tentativas + 1) >= maxTentativas) {
            // Marcar como inativo (expirou)
            await supabase
              .from('lembretes_followup')
              .update({ 
                ativo: false,
                ultima_pergunta: agora.toISOString(),
                tentativas: followup.tentativas + 1
              })
              .eq('id', followup.id);
            
            console.log(`⏰ Lembrete expirado: ${evento.titulo}`);
          } else {
            // Atualizar para próximo follow-up
            await supabase
              .from('lembretes_followup')
              .update({ 
                ultima_pergunta: agora.toISOString(),
                tentativas: followup.tentativas + 1,
                proxima_pergunta: proximaPergunta.toISOString(),
                intervalo_atual: novoIntervalo
              })
              .eq('id', followup.id);
          }
          
          console.log(`✅ Follow-up enviado: ${evento.titulo} (tentativa ${followup.tentativas + 1})`);
          enviados++;
        } else {
          const errorText = await zapiResponse.text();
          console.error(`❌ Erro Z-API para follow-up ${followup.id}:`, errorText);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao processar follow-up ${followup.id}:`, error);
      }
    }
    
    console.log(`📨 ${enviados}/${followups.length} follow-ups enviados`);
    
    return new Response(JSON.stringify({ 
      status: 'ok',
      processados: enviados,
      total: followups.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
