import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔔 Processando lembretes snooze...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabase = createClient(
      supabaseUrl,
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
    
    let enviados = 0;
    
    // Processar lembretes pendentes
    if (lembretes && lembretes.length > 0) {
      for (const lembrete of lembretes) {
        try {
          console.log(`📤 Enviando snooze para ${lembrete.whatsapp}: ${lembrete.mensagem}`);
          
          // ✅ Reutilizar enviar-whatsapp (centralizado)
          const enviarResponse = await fetch(
            `${supabaseUrl}/functions/v1/enviar-whatsapp`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`
              },
              body: JSON.stringify({
                phone: lembrete.whatsapp,
                message: lembrete.mensagem
              })
            }
          );
          
          const result = await enviarResponse.json();
          
          if (enviarResponse.ok && result.success) {
            // Marcar como enviado
            await supabase
              .from('lembretes_snooze')
              .update({ enviado: true })
              .eq('id', lembrete.id);
            
            console.log(`✅ Snooze enviado: ${lembrete.mensagem}`);
            enviados++;
          } else {
            console.error(`❌ Erro ao enviar snooze ${lembrete.id}:`, result.error);
          }
          
        } catch (error) {
          console.error(`❌ Erro ao processar snooze ${lembrete.id}:`, error);
        }
      }
    }
    
    // 🧹 Limpeza automática: remover snoozes enviados há mais de 7 dias
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    
    const { error: deleteError, count } = await supabase
      .from('lembretes_snooze')
      .delete()
      .eq('enviado', true)
      .lt('criado_em', seteDiasAtras.toISOString());
    
    if (deleteError) {
      console.error('⚠️ Erro na limpeza:', deleteError);
    } else if (count && count > 0) {
      console.log(`🧹 ${count} snoozes antigos limpos`);
    }
    
    console.log(`📨 ${enviados}/${lembretes?.length || 0} snoozes enviados`);
    
    return new Response(JSON.stringify({ 
      status: 'ok',
      processados: enviados,
      total: lembretes?.length || 0
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
