import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message } = await req.json();

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      console.error('Variáveis Z-API não configuradas');
      throw new Error('Configuração Z-API ausente');
    }

    if (!phone || !message) {
      throw new Error('Phone e message são obrigatórios');
    }

    console.log(`📤 Enviando WhatsApp para ${phone}: ${message.substring(0, 50)}...`);

    const response = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: phone,
          message: message
        })
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Erro Z-API:', responseData);
      throw new Error(`Z-API error: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ WhatsApp enviado com sucesso:', responseData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.messageId || responseData.zapiMessageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro ao enviar WhatsApp:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
