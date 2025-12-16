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
    console.log('🔔 Processando lembretes snooze...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const agora = new Date();
    
    // Buscar lembretes que devem ser enviados agora
    const { data: lembretes, error: fetchError } = await supabase
      .from('lembretes_snooze')
      .select('*')
      .eq('enviado', false)
      .lte('enviar_em', agora.toISOString())
      .limit(50);
    
    if (fetchError) {
      console.error('Erro ao buscar snooze:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📋 ${lembretes?.length || 0} lembretes snooze para processar`);
    
    if (!lembretes || lembretes.length === 0) {
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
    
    for (const lembrete of lembretes) {
      try {
        console.log(`📤 Enviando snooze para ${lembrete.whatsapp}: ${lembrete.mensagem}`);
        
        // Enviar via Z-API diretamente
        const zapiResponse = await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Client-Token': ZAPI_CLIENT_TOKEN || ''
            },
            body: JSON.stringify({
              phone: lembrete.whatsapp,
              message: lembrete.mensagem
            })
          }
        );
        
        if (zapiResponse.ok) {
          // Marcar como enviado
          await supabase
            .from('lembretes_snooze')
            .update({ enviado: true })
            .eq('id', lembrete.id);
          
          console.log(`✅ Snooze enviado: ${lembrete.mensagem}`);
          enviados++;
        } else {
          const errorText = await zapiResponse.text();
          console.error(`❌ Erro Z-API para snooze ${lembrete.id}:`, errorText);
        }
        
      } catch (error) {
        console.error(`❌ Erro ao processar snooze ${lembrete.id}:`, error);
      }
    }
    
    console.log(`📨 ${enviados}/${lembretes.length} snoozes enviados`);
    
    return new Response(JSON.stringify({ 
      status: 'ok',
      processados: enviados,
      total: lembretes.length
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
