import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, userId, nome } = await req.json();
    
    console.log('📱 Enviando boas-vindas para:', phone, 'Nome:', nome);
    
    if (!phone) {
      throw new Error('Phone required');
    }
    
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID");
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
    const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
    
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }
    
    // Se não tiver nome, buscar do banco
    let nomeUsuario = nome;
    
    if (!nomeUsuario && userId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      
      const { data: userData } = await supabase
        .from('whatsapp_usuarios')
        .select('nome')
        .eq('usuario_id', userId)
        .maybeSingle();
      
      nomeUsuario = userData?.nome;
    }
    
    // Fallback para nome genérico
    const primeiroNome = nomeUsuario?.split(' ')[0] || 'Olá';
    
    // Mensagem de boas-vindas personalizada
    const mensagem = `👋 Oi ${primeiroNome}! Eu sou a *Malu* 🧠✨

Vou te ajudar a *nunca mais esquecer* compromissos, remédios e tarefas!

🔁 Eu *insisto* até você fazer
🧠 Entendo *texto, áudio e foto*
🎉 Comemoro suas *conquistas*!

Vamos testar? Me manda algo assim:

💊 "Tomar remédio todo dia 20h"
📅 "Dentista terça 14h"
🎂 "Aniversário da Maria dia 25"
🏃 "Academia segunda, quarta e sexta 7h"

Pode começar! Estou aqui pra te ajudar 🚀`;
    
    // Enviar via Z-API
    const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    
    console.log('📤 Enviando para Z-API...');
    
    const response = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify({
        phone: phone,
        message: mensagem
      })
    });
    
    const responseText = await response.text();
    console.log('📥 Resposta Z-API:', response.status, responseText);
    
    if (!response.ok) {
      throw new Error(`Z-API error: ${response.status} - ${responseText}`);
    }
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }
    
    console.log('✅ Boas-vindas enviadas com sucesso para:', phone);
    
    return new Response(JSON.stringify({ 
      success: true,
      messageId: result.messageId || result.zapiMessageId,
      phone: phone
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Erro enviar boas-vindas:', errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
