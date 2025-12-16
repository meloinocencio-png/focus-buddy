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
    const lembretes: Array<{
      whatsapp: string;
      mensagem: string;
      evento_id: string;
      tipo: string;
    }> = [];

    console.log(`🔔 Verificando lembretes em ${agora.toISOString()}`);

    // Buscar eventos futuros (próximos 7 dias)
    const dataLimite = new Date(agora);
    dataLimite.setDate(dataLimite.getDate() + 8);

    const { data: eventos, error: eventosError } = await supabase
      .from('eventos')
      .select('*')
      .gte('data', hoje)
      .lte('data', dataLimite.toISOString().split('T')[0]);

    if (eventosError) {
      console.error('Erro ao buscar eventos:', eventosError);
      throw eventosError;
    }

    console.log(`📅 Encontrados ${eventos?.length || 0} eventos`);

    for (const evento of eventos || []) {
      // Buscar WhatsApp do usuário
      const { data: whatsappData } = await supabase
        .from('whatsapp_usuarios')
        .select('whatsapp')
        .eq('usuario_id', evento.usuario_id)
        .eq('ativo', true)
        .maybeSingle();

      if (!whatsappData?.whatsapp) {
        console.log(`⚠️ Usuário ${evento.usuario_id} sem WhatsApp ativo`);
        continue;
      }

      const whatsapp = whatsappData.whatsapp;
      const dataEvento = new Date(evento.data);
      const diasRestantes = Math.ceil((dataEvento.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));

      // ANIVERSÁRIOS - lembretes em cascata com checklist
      if (evento.tipo === 'aniversario') {
        const dataFormatada = `${dataEvento.getDate()}/${dataEvento.getMonth() + 1}`;
        
        if (diasRestantes === 7) {
          let msg = `🎂 Próxima semana: aniversário de ${evento.pessoa} (dia ${dataFormatada})\n\n`;
          msg += `📋 Lembrete:\n`;
          msg += `□ Presente comprado?\n`;
          msg += `□ Cartão/mensagem?\n`;
          msg += `□ Confirmou presença?`;
          
          lembretes.push({
            whatsapp,
            mensagem: msg,
            evento_id: evento.id,
            tipo: '7d'
          });
        }
        if (diasRestantes === 3) {
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Em 3 dias: aniversário de ${evento.pessoa}`,
            evento_id: evento.id,
            tipo: '3d'
          });
        }
        if (diasRestantes === 1) {
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Amanhã: aniversário de ${evento.pessoa}`,
            evento_id: evento.id,
            tipo: '1d'
          });
        }
        if (diasRestantes === 0) {
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Hoje: aniversário de ${evento.pessoa}!`,
            evento_id: evento.id,
            tipo: '0d'
          });
        }
      }

      // COMPROMISSOS - lembretes 3h, 1h e 30min antes (somente no dia)
      if (evento.tipo !== 'aniversario' && diasRestantes === 0) {
        const horaEvento = dataEvento.getHours();
        const minutoEvento = dataEvento.getMinutes();
        const horaFormatada = `${horaEvento.toString().padStart(2, '0')}:${minutoEvento.toString().padStart(2, '0')}`;
        
        // Calcular horas restantes
        const horaEventoMs = new Date(agora);
        horaEventoMs.setHours(horaEvento, minutoEvento, 0, 0);
        const horasRestantes = (horaEventoMs.getTime() - agora.getTime()) / (1000 * 60 * 60);

        // Preparar links de navegação se tiver endereço
        let enderecoInfo = '';
        if (evento.endereco) {
          const enderecoEncoded = encodeURIComponent(evento.endereco);
          enderecoInfo = `\n📍 ${evento.endereco}\n🗺️ Waze: https://waze.com/ul?q=${enderecoEncoded}&navigate=yes\n🗺️ Maps: https://www.google.com/maps/search/?api=1&query=${enderecoEncoded}`;
        }

        if (horasRestantes > 2.5 && horasRestantes <= 3.5) {
          lembretes.push({
            whatsapp,
            mensagem: `⏰ Em 3h: ${evento.titulo} (${horaFormatada})${enderecoInfo}`,
            evento_id: evento.id,
            tipo: '3h'
          });
        }
        if (horasRestantes > 0.5 && horasRestantes <= 1.5) {
          lembretes.push({
            whatsapp,
            mensagem: `⏰ Em 1h: ${evento.titulo}${enderecoInfo}`,
            evento_id: evento.id,
            tipo: '1h'
          });
        }

        // CHECKLIST - 30 minutos antes (somente se tem checklist)
        const checklist = evento.checklist as string[] | null;
        if (checklist && checklist.length > 0 && horasRestantes > 0.4 && horasRestantes <= 0.6) {
          let checklistMsg = `⏰ ${evento.titulo} em 30 minutos!\n\n`;
          checklistMsg += `📋 Já pegou:\n`;
          
          checklist.forEach((item: string) => {
            checklistMsg += `□ ${item}\n`;
          });
          
          checklistMsg += `\nTudo pronto?`;

          lembretes.push({
            whatsapp,
            mensagem: checklistMsg,
            evento_id: evento.id,
            tipo: '30min_checklist'
          });
        }
      }
    }

    console.log(`📨 ${lembretes.length} lembretes para enviar`);

    // Enviar lembretes (evitando duplicatas)
    let enviados = 0;
    for (const lembrete of lembretes) {
      // Verificar se já foi enviado
      const { data: jaEnviado } = await supabase
        .from('lembretes_enviados')
        .select('id')
        .eq('evento_id', lembrete.evento_id)
        .eq('tipo_lembrete', lembrete.tipo)
        .maybeSingle();

      if (jaEnviado) {
        console.log(`⏭️ Lembrete já enviado: ${lembrete.tipo} para evento ${lembrete.evento_id}`);
        continue;
      }

      // Enviar via Z-API
      const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
      const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');

      if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
        console.error('❌ Z-API não configurada');
        continue;
      }

      try {
        const zapiResponse = await fetch(
          `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Client-Token': Deno.env.get('ZAPI_CLIENT_TOKEN') || ''
            },
            body: JSON.stringify({
              phone: lembrete.whatsapp,
              message: lembrete.mensagem
            })
          }
        );

        if (!zapiResponse.ok) {
          console.error(`❌ Erro Z-API: ${await zapiResponse.text()}`);
          continue;
        }

        // Registrar envio
        await supabase
          .from('lembretes_enviados')
          .insert({
            evento_id: lembrete.evento_id,
            tipo_lembrete: lembrete.tipo
          });

        enviados++;
        console.log(`✅ Enviado: ${lembrete.mensagem}`);
      } catch (zapiError) {
        console.error(`❌ Erro ao enviar lembrete:`, zapiError);
      }
    }

    return new Response(
      JSON.stringify({ 
        total_lembretes: lembretes.length,
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
