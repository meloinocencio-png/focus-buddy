import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    // Buscar lembretes que precisam de follow-up
    const { data: followups, error: fetchError } = await supabase
      .from('lembretes_followup')
      .select(`
        *,
        eventos!inner(id, titulo, tipo)
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
        
        // Montar mensagem de follow-up
        let mensagem = '';
        
        if (followup.tentativas === 0) {
          mensagem = `👋 E aí? Já fez isso?\n\n📝 ${evento.titulo}`;
        } else if (followup.tentativas === 1) {
          mensagem = `👋 Conseguiu fazer?\n\n📝 ${evento.titulo}`;
        } else if (followup.tentativas === 2) {
          mensagem = `👋 E esse lembrete?\n\n📝 ${evento.titulo}`;
        } else {
          const diasPassados = Math.floor(
            (agora.getTime() - new Date(followup.criado_em).getTime()) / (1000 * 60 * 60 * 24)
          );
          mensagem = `☀️ Bom dia!\n\n📝 Lembra disso? (dia ${diasPassados})\n${evento.titulo}`;
        }
        
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
          // Calcular próximo intervalo
          const novoIntervalo = calcularProximoIntervalo(followup.tentativas);
          const proximaPergunta = new Date();
          proximaPergunta.setMinutes(proximaPergunta.getMinutes() + novoIntervalo);
          
          // Verificar se passou do limite de 7 dias
          const dataLimite = new Date(followup.data_limite);
          
          if (proximaPergunta > dataLimite) {
            // Marcar como inativo (expirou)
            await supabase
              .from('lembretes_followup')
              .update({ 
                ativo: false,
                ultima_pergunta: agora.toISOString()
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
          
          console.log(`✅ Follow-up enviado: ${evento.titulo}`);
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

// ═══════════════════════════════════════════════════════════
// FUNÇÃO: Calcular próximo intervalo (escala progressiva)
// ═══════════════════════════════════════════════════════════
function calcularProximoIntervalo(tentativas: number): number {
  // Escala: 3h → 6h → 12h → 24h (manhã seguinte)
  
  if (tentativas === 0) {
    return 180; // 3 horas
  } else if (tentativas === 1) {
    return 360; // 6 horas
  } else if (tentativas === 2) {
    return 720; // 12 horas
  } else {
    // 3+ tentativas: sempre manhã seguinte (9h do dia seguinte)
    const agora = new Date();
    const amanha9h = new Date();
    amanha9h.setDate(amanha9h.getDate() + 1);
    amanha9h.setHours(9, 0, 0, 0);
    
    const minutosAteAmanha = Math.ceil((amanha9h.getTime() - agora.getTime()) / (1000 * 60));
    return Math.max(minutosAteAmanha, 60); // Mínimo 1h
  }
}
