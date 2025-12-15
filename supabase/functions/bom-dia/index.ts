import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];

    console.log(`🌅 Enviando bom dia em ${agora.toISOString()}`);

    // Buscar todos usuários com WhatsApp ativo
    const { data: usuarios, error: usuariosError } = await supabase
      .from('whatsapp_usuarios')
      .select('usuario_id, whatsapp')
      .eq('ativo', true);

    if (usuariosError) {
      throw usuariosError;
    }

    console.log(`👥 ${usuarios?.length || 0} usuários ativos`);

    let enviados = 0;
    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API não configurada');
    }

    for (const usuario of usuarios || []) {
      // Buscar eventos de HOJE para este usuário
      const { data: eventosHoje } = await supabase
        .from('eventos')
        .select('titulo, data, tipo')
        .eq('usuario_id', usuario.usuario_id)
        .gte('data', `${hoje}T00:00:00`)
        .lte('data', `${hoje}T23:59:59`)
        .order('data', { ascending: true });

      let mensagem: string;

      if (eventosHoje && eventosHoje.length > 0) {
        const lista = eventosHoje.map(e => {
          const hora = new Date(e.data);
          const horaFormatada = `${hora.getHours().toString().padStart(2, '0')}:${hora.getMinutes().toString().padStart(2, '0')}`;
          const horarioTexto = hora.getHours() === 0 && hora.getMinutes() === 0 ? 'Dia todo' : horaFormatada;
          return `• ${horarioTexto} - ${e.titulo}`;
        }).join('\n');

        mensagem = `📅 Bom dia! Hoje:\n${lista}`;
      } else {
        mensagem = `📅 Bom dia! Hoje sem compromissos.`;
      }

      try {
        const response = await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Client-Token': ZAPI_CLIENT_TOKEN
            },
            body: JSON.stringify({
              phone: usuario.whatsapp,
              message: mensagem
            })
          }
        );

        if (response.ok) {
          enviados++;
          console.log(`✅ Bom dia enviado para ${usuario.whatsapp}`);
        } else {
          console.error(`❌ Erro ao enviar para ${usuario.whatsapp}: ${await response.text()}`);
        }
      } catch (error) {
        console.error(`❌ Erro Z-API:`, error);
      }
    }

    return new Response(
      JSON.stringify({ 
        usuarios_ativos: usuarios?.length || 0,
        enviados,
        timestamp: agora.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
