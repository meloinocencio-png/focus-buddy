import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TravelTimeResult {
  tempo_viagem_minutos: number;
  distancia_km: number;
  status_trafego: 'leve' | 'moderado' | 'pesado';
  tempo_sem_trafego_minutos: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { evento_id, destino, data_hora, origem } = await req.json();

    console.log(`🚗 Calculando tempo de viagem para evento ${evento_id}`);
    console.log(`📍 Destino: ${destino}`);
    console.log(`📍 Origem: ${origem || 'padrão (usuário)'}`);
    console.log(`⏰ Horário: ${data_hora}`);

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('❌ GOOGLE_MAPS_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'API key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Origem padrão se não especificada (usar WhatsApp do usuário para buscar endereço padrão)
    // Por enquanto, usar um endereço padrão de Ribeirão Preto se não tiver origem
    let origemFinal = origem;
    
    if (!origemFinal) {
      // Buscar endereço padrão "casa" dos locais favoritos do usuário
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // Buscar evento para pegar usuario_id
      const { data: evento } = await supabase
        .from('eventos')
        .select('usuario_id')
        .eq('id', evento_id)
        .single();
      
      if (evento) {
        const { data: localCasa } = await supabase
          .from('locais_favoritos')
          .select('endereco')
          .eq('usuario_id', evento.usuario_id)
          .ilike('apelido', '%casa%')
          .limit(1)
          .maybeSingle();
        
        if (localCasa) {
          origemFinal = localCasa.endereco;
          console.log(`🏠 Usando local "casa" como origem: ${origemFinal}`);
        }
      }
    }

    if (!origemFinal) {
      console.error('❌ Origem não definida e não foi possível buscar padrão');
      return new Response(
        JSON.stringify({ error: 'Origem não especificada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calcular departure_time (timestamp UNIX)
    const departureTime = Math.floor(new Date(data_hora).getTime() / 1000);
    const agora = Math.floor(Date.now() / 1000);
    
    // Se a data é no passado ou muito próxima, usar "now"
    const useDepartureTime = departureTime > agora + 300; // > 5 min no futuro

    // Montar URL da Distance Matrix API
    const params = new URLSearchParams({
      origins: origemFinal,
      destinations: destino,
      mode: 'driving',
      language: 'pt-BR',
      key: GOOGLE_MAPS_API_KEY,
    });

    // Adicionar departure_time para considerar trânsito
    if (useDepartureTime) {
      params.append('departure_time', departureTime.toString());
      params.append('traffic_model', 'best_guess'); // best_guess, pessimistic, optimistic
    } else {
      params.append('departure_time', 'now');
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`;
    console.log(`📡 Chamando Google Maps API...`);

    const response = await fetch(url);
    const data = await response.json();

    console.log('📦 Resposta Google Maps:', JSON.stringify(data, null, 2));

    if (data.status !== 'OK') {
      console.error('❌ Erro na API do Google:', data.status, data.error_message);
      return new Response(
        JSON.stringify({ error: `Google Maps API: ${data.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      console.error('❌ Rota não encontrada:', element?.status);
      return new Response(
        JSON.stringify({ error: 'Rota não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extrair dados
    const distanciaMetros = element.distance.value;
    const distanciaKm = parseFloat((distanciaMetros / 1000).toFixed(1));
    
    // Tempo com trânsito (em segundos)
    const tempoComTrafegoSec = element.duration_in_traffic?.value || element.duration.value;
    const tempoComTrafegoMin = Math.ceil(tempoComTrafegoSec / 60);
    
    // Tempo sem trânsito (em segundos)
    const tempoSemTrafegoSec = element.duration.value;
    const tempoSemTrafegoMin = Math.ceil(tempoSemTrafegoSec / 60);

    // Classificar trânsito
    const ratio = tempoComTrafegoMin / tempoSemTrafegoMin;
    let statusTrafego: 'leve' | 'moderado' | 'pesado';
    
    if (ratio < 1.2) {
      statusTrafego = 'leve';
    } else if (ratio < 1.5) {
      statusTrafego = 'moderado';
    } else {
      statusTrafego = 'pesado';
    }

    console.log(`🚗 Distância: ${distanciaKm} km`);
    console.log(`⏱️ Tempo com trânsito: ${tempoComTrafegoMin} min`);
    console.log(`⏱️ Tempo sem trânsito: ${tempoSemTrafegoMin} min`);
    console.log(`🚦 Status trânsito: ${statusTrafego} (ratio: ${ratio.toFixed(2)})`);

    // Atualizar evento no banco
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: updateError } = await supabase
      .from('eventos')
      .update({
        tempo_viagem_minutos: tempoComTrafegoMin,
        ultimo_calculo_viagem: new Date().toISOString(),
        origem_viagem: origemFinal
      })
      .eq('id', evento_id);

    if (updateError) {
      console.error('❌ Erro ao atualizar evento:', updateError);
    } else {
      console.log('✅ Evento atualizado com tempo de viagem');
    }

    const result: TravelTimeResult = {
      tempo_viagem_minutos: tempoComTrafegoMin,
      distancia_km: distanciaKm,
      status_trafego: statusTrafego,
      tempo_sem_trafego_minutos: tempoSemTrafegoMin
    };

    return new Response(
      JSON.stringify(result),
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
