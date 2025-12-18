import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, formatarHoraBRT, formatarTempoRestante, podeEnviarLembreteUsuario } from "../_shared/utils.ts";

// Helper: Calcular tempo de viagem via edge function
async function calcularTempoViagem(
  supabaseUrl: string,
  supabaseKey: string,
  evento: any
): Promise<{ tempo_viagem_minutos: number; distancia_km: number; status_trafego: string } | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/calcular-tempo-viagem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        evento_id: evento.id,
        destino: evento.endereco,
        data_hora: evento.data,
        origem: evento.origem_viagem
      })
    });

    if (!response.ok) {
      console.error(`❌ Erro ao calcular viagem: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Erro na chamada de tempo de viagem:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    const lembretes: Array<{
      whatsapp: string;
      mensagem: string;
      evento_id: string;
      tipo: string;
      usuario_id: string;
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

    // ═══════════════════════════════════════════════════════════
    // PRÉ-PROCESSAR: Calcular tempo de viagem para eventos próximos
    // ═══════════════════════════════════════════════════════════
    const eventosComEndereco = (eventos || []).filter(e => 
      e.endereco && 
      e.tipo !== 'aniversario' &&
      e.status !== 'cancelado' &&
      e.status !== 'concluido'
    );

    for (const evento of eventosComEndereco) {
      const dataEvento = new Date(evento.data);
      const horasAteEvento = (dataEvento.getTime() - agora.getTime()) / (1000 * 60 * 60);
      
      // Calcular apenas se evento nas próximas 4 horas
      if (horasAteEvento > 0 && horasAteEvento <= 4) {
        // Verificar se já calculou recentemente (última hora)
        const ultimoCalculo = evento.ultimo_calculo_viagem 
          ? new Date(evento.ultimo_calculo_viagem) 
          : null;
        
        const precisaRecalcular = !ultimoCalculo || 
          (agora.getTime() - ultimoCalculo.getTime()) > 60 * 60 * 1000; // 1 hora
        
        if (precisaRecalcular) {
          console.log(`🚗 Calculando viagem para: ${evento.titulo}`);
          await calcularTempoViagem(supabaseUrl, supabaseKey, evento);
        }
      }
    }

    // Recarregar eventos com dados de viagem atualizados
    const { data: eventosAtualizados } = await supabase
      .from('eventos')
      .select('*')
      .gte('data', hoje)
      .lte('data', dataLimite.toISOString().split('T')[0]);

    for (const evento of eventosAtualizados || []) {
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
      
      // ✅ FIX: Comparar datas como strings para determinar "hoje" e "amanhã" corretamente
      const hojeStr = agora.toISOString().split('T')[0];
      const eventoStr = dataEvento.toISOString().split('T')[0];
      const amanhaDate = new Date(agora);
      amanhaDate.setDate(amanhaDate.getDate() + 1);
      const amanhaStr = amanhaDate.toISOString().split('T')[0];
      
      const isHoje = hojeStr === eventoStr;
      const isAmanha = amanhaStr === eventoStr;
      
      // ✅ FIX: Math.floor para aniversários (dias completos)
      const diffMs = dataEvento.getTime() - agora.getTime();
      const diasRestantes = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // ANIVERSÁRIOS - lembretes em cascata com checklist
      if (evento.tipo === 'aniversario') {
        const dataFormatada = `${dataEvento.getDate()}/${dataEvento.getMonth() + 1}`;
        
        if (diasRestantes === 7 || diasRestantes === 6) { // Range para pegar ~7 dias
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Próxima semana: aniversário de ${evento.pessoa} (dia ${dataFormatada})\n\n📋 Lembrete:\n□ Presente comprado?\n□ Cartão/mensagem?\n□ Confirmou presença?`,
            evento_id: evento.id,
            tipo: '7d',
            usuario_id: evento.usuario_id
          });
        }
        if (diasRestantes === 3 || diasRestantes === 2) { // Range para pegar ~3 dias
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Em 3 dias: aniversário de ${evento.pessoa}`,
            evento_id: evento.id,
            tipo: '3d',
            usuario_id: evento.usuario_id
          });
        }
        if (isAmanha) {
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Amanhã: aniversário de ${evento.pessoa}`,
            evento_id: evento.id,
            tipo: '1d',
            usuario_id: evento.usuario_id
          });
        }
        if (isHoje) {
          lembretes.push({
            whatsapp,
            mensagem: `🎂 Hoje: aniversário de ${evento.pessoa}!`,
            evento_id: evento.id,
            tipo: '0d',
            usuario_id: evento.usuario_id
          });
        }
      }

      // COMPROMISSOS - lembretes 3h, 1h, 30min e na hora (somente no dia E no futuro)
      if (evento.tipo !== 'aniversario' && isHoje) {
        // ✅ FIX: Usar formatarHoraBRT para exibir hora correta de Brasília
        const horaFormatada = formatarHoraBRT(dataEvento);
        
        // ✅ FIX: Calcular horas restantes DIRETAMENTE do timestamp do evento
        const horasRestantes = (dataEvento.getTime() - agora.getTime()) / (1000 * 60 * 60);
        
        console.log(`📊 Evento "${evento.titulo}": horasRestantes=${horasRestantes.toFixed(2)}h`);

        // ═══════════════════════════════════════════════════════════
        // MONTAR INFORMAÇÃO DE VIAGEM (se disponível)
        // ═══════════════════════════════════════════════════════════
        let viagemInfo = '';
        let horaSair = '';
        
        if (evento.endereco && evento.tempo_viagem_minutos) {
          const tempoViagem = evento.tempo_viagem_minutos;
          const tempoBuffer = 5; // 5 min de buffer
          const tempoTotal = tempoViagem + tempoBuffer;
          
          // Calcular horário de saída (em BRT)
          const horarioSaida = new Date(dataEvento.getTime() - tempoTotal * 60 * 1000);
          const horaSaidaStr = formatarHoraBRT(horarioSaida);
          horaSair = horaSaidaStr;
          
          // Buscar dados de trânsito mais recentes (se calculados)
          let statusTrafego = '';
          if (evento.ultimo_calculo_viagem) {
            // Inferir status do trânsito baseado no tempo
            const tempoBase = tempoViagem * 0.8; // Estimar tempo base como 80% do tempo com trânsito
            const ratio = tempoViagem / tempoBase;
            if (ratio >= 1.5) statusTrafego = '🔴 *TRÂNSITO PESADO*';
            else if (ratio >= 1.2) statusTrafego = '🟡 Trânsito moderado';
            else statusTrafego = '🟢 Trânsito leve';
          }
          
          // Calcular distância estimada (se não temos, estimar ~30km/h em cidade)
          const distanciaEstimada = (tempoViagem / 60 * 30).toFixed(1);
          
          // Truncar endereço
          const enderecoTruncado = evento.endereco.length > 40 
            ? evento.endereco.substring(0, 37) + '...'
            : evento.endereco;
          
          viagemInfo = `\n📍 ${enderecoTruncado} (~${distanciaEstimada}km)`;
          if (statusTrafego) viagemInfo += `\n${statusTrafego}`;
          viagemInfo += `\n🚗 Viagem: ~${tempoViagem}min`;
          viagemInfo += `\n⏰ *Saia às ${horaSaidaStr}*`;
          
          // Adicionar links de navegação
          const enderecoEncoded = encodeURIComponent(evento.endereco);
          viagemInfo += `\n🗺️ https://waze.com/ul?q=${enderecoEncoded}&navigate=yes`;
        } else if (evento.endereco) {
          // Tem endereço mas sem tempo de viagem calculado
          const enderecoEncoded = encodeURIComponent(evento.endereco);
          const enderecoTruncado = evento.endereco.length > 40 
            ? evento.endereco.substring(0, 37) + '...'
            : evento.endereco;
          viagemInfo = `\n📍 ${enderecoTruncado}`;
          viagemInfo += `\n🗺️ Waze: https://waze.com/ul?q=${enderecoEncoded}&navigate=yes`;
        }

        // ═══════════════════════════════════════════════════════════
        // VERIFICAR SE PRECISA DE ALERTA ESPECIAL
        // ═══════════════════════════════════════════════════════════
        let alertaEspecial = '';
        if (evento.tempo_viagem_minutos && horaSair) {
          const [horaSairH, horaSairM] = horaSair.split(':').map(Number);
          const dataHoraSair = new Date(dataEvento);
          dataHoraSair.setHours(horaSairH, horaSairM, 0, 0);
          
          const minutosParaSair = (dataHoraSair.getTime() - agora.getTime()) / (1000 * 60);
          
          if (minutosParaSair < 0) {
            alertaEspecial = '\n\n🚨 *VOCÊ JÁ ESTÁ ATRASADO!*';
          } else if (minutosParaSair <= 5) {
            alertaEspecial = '\n\n⚡ *SAIA AGORA!*';
          } else if (minutosParaSair <= 15) {
            alertaEspecial = `\n\n⏰ Saia em ${Math.ceil(minutosParaSair)} minutos!`;
          }
        }

        // Somente enviar lembretes para eventos FUTUROS (horasRestantes > 0)
        if (horasRestantes > 0) {
          const tempoRestante = formatarTempoRestante(horasRestantes);
          
          // Lembrete 3h antes
          if (horasRestantes > 2.5 && horasRestantes <= 3.5) {
            lembretes.push({
              whatsapp,
              mensagem: `⏰ Em ${tempoRestante}: ${evento.titulo} (${horaFormatada})${viagemInfo}`,
              evento_id: evento.id,
              tipo: '3h',
              usuario_id: evento.usuario_id
            });
          }
          
          // Lembrete 1h antes
          if (horasRestantes > 0.75 && horasRestantes <= 1.25) {
            lembretes.push({
              whatsapp,
              mensagem: `⏰ Em ${tempoRestante}: ${evento.titulo}${viagemInfo}${alertaEspecial}`,
              evento_id: evento.id,
              tipo: '1h',
              usuario_id: evento.usuario_id
            });
          }

          // CHECKLIST - 30 minutos antes (somente se tem checklist)
          const checklist = evento.checklist as string[] | null;
          if (checklist && checklist.length > 0 && horasRestantes > 0.4 && horasRestantes <= 0.6) {
            let checklistMsg = `⏰ ${evento.titulo} em ${tempoRestante}!\n\n`;
            checklistMsg += `📋 Já pegou:\n`;
            
            checklist.forEach((item: string) => {
              checklistMsg += `□ ${item}\n`;
            });
            
            checklistMsg += `\nTudo pronto?`;
            
            // Adicionar alerta de horário de saída se tiver viagem
            if (horaSair) {
              checklistMsg += `\n\n⏰ *Saia às ${horaSair}*`;
            }

            lembretes.push({
              whatsapp,
              mensagem: checklistMsg,
              evento_id: evento.id,
              tipo: '30min_checklist',
              usuario_id: evento.usuario_id
            });
          }
          
          // ✅ NEW: Lembrete "NA HORA" (entre 0 e 10 minutos antes)
          if (horasRestantes > 0 && horasRestantes <= 0.17) { // ~10 minutos
            let msgNaHora = `⏰ AGORA: ${evento.titulo}!`;
            if (evento.endereco) {
              const enderecoEncoded = encodeURIComponent(evento.endereco);
              msgNaHora += `\n🗺️ https://waze.com/ul?q=${enderecoEncoded}&navigate=yes`;
            }
            if (alertaEspecial.includes('ATRASADO')) {
              msgNaHora += alertaEspecial;
            }
            
            lembretes.push({
              whatsapp,
              mensagem: msgNaHora,
              evento_id: evento.id,
              tipo: '0min',
              usuario_id: evento.usuario_id
            });
          }
        }
      }
    }

    console.log(`📨 ${lembretes.length} lembretes para enviar`);

    // Enviar lembretes (evitando duplicatas + anti-spam)
    let enviados = 0;
    let bloqueados = 0;
    
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

      // ═══════════════════════════════════════════════════════════
      // ANTI-SPAM: Verificar se pode enviar ao usuário
      // ═══════════════════════════════════════════════════════════
      const ehCritico = ['1h', '0min', '30min_checklist'].includes(lembrete.tipo);
      
      const podeEnviar = await podeEnviarLembreteUsuario(
        supabase, 
        lembrete.usuario_id, 
        ehCritico
      );
      
      if (!podeEnviar) {
        console.log(`⏸️ Anti-spam: bloqueado ${lembrete.tipo} para ${lembrete.usuario_id}`);
        bloqueados++;
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

        // Capturar messageId da resposta
        const zapiResult = await zapiResponse.json();
        console.log('[ZAPI SEND RESPONSE]', JSON.stringify(zapiResult));
        
        const messageId = zapiResult.messageId || zapiResult.id || zapiResult.message?.id;

        // Registrar envio com usuario_id e zapi_message_id
        await supabase
          .from('lembretes_enviados')
          .insert({
            evento_id: lembrete.evento_id,
            tipo_lembrete: lembrete.tipo,
            usuario_id: lembrete.usuario_id,
            zapi_message_id: messageId,
            status: 'enviado'
          });

        enviados++;
        console.log(`✅ Enviado: ${lembrete.mensagem.substring(0, 50)}... (msgId: ${messageId})`);
      } catch (zapiError) {
        console.error(`❌ Erro ao enviar lembrete:`, zapiError);
      }
    }
    
    console.log(`📊 Anti-spam: ${bloqueados} lembretes bloqueados`);

    // ═══════════════════════════════════════════════════════════
    // FOLLOW-UP AUTOMÁTICO PARA EVENTOS PASSADOS
    // ═══════════════════════════════════════════════════════════
    const MINUTOS_DEPOIS = 15;    // Primeira pergunta 15min após passar
    const MAX_DIAS_FOLLOWUP = 3;  // 3 dias de follow-up
    const MAX_TENTATIVAS = 7;     // 7 tentativas máximo

    // Buscar eventos que já passaram (hoje mas antes de agora - 15min)
    const inicioDia = new Date(agora);
    inicioDia.setHours(0, 0, 0, 0);
    
    const limiteBusca = new Date(agora.getTime() - MINUTOS_DEPOIS * 60 * 1000);

    const { data: eventosPassados } = await supabase
      .from('eventos')
      .select('*')
      .gte('data', inicioDia.toISOString())
      .lt('data', limiteBusca.toISOString())
      .eq('status', 'pendente')
      .neq('tipo', 'aniversario');

    console.log(`📋 Eventos passados pendentes: ${eventosPassados?.length || 0}`);

    let followupsCreated = 0;
    for (const evento of eventosPassados || []) {
      // Buscar WhatsApp do usuário
      const { data: whatsappData } = await supabase
        .from('whatsapp_usuarios')
        .select('whatsapp')
        .eq('usuario_id', evento.usuario_id)
        .eq('ativo', true)
        .maybeSingle();

      if (!whatsappData?.whatsapp) continue;

      // Verificar se já tem follow-up ativo para este evento
      const { data: followupExistente } = await supabase
        .from('lembretes_followup')
        .select('id')
        .eq('evento_id', evento.id)
        .eq('ativo', true)
        .maybeSingle();

      if (followupExistente) continue; // Já existe, pular

      // Criar follow-up com proxima_pergunta = AGORA
      const dataLimite = new Date(agora.getTime() + MAX_DIAS_FOLLOWUP * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('lembretes_followup')
        .insert([{
          evento_id: evento.id,
          usuario_id: evento.usuario_id,
          whatsapp: whatsappData.whatsapp,
          tentativas: 0,
          proxima_pergunta: new Date().toISOString(), // AGORA
          intervalo_atual: 180, // 3 horas
          max_tentativas: MAX_TENTATIVAS,
          max_dias: MAX_DIAS_FOLLOWUP,
          data_limite: dataLimite.toISOString(),
          ativo: true,
          concluido: false
        }]);

      if (!error) {
        console.log(`✅ Follow-up criado para evento passado: ${evento.titulo}`);
        followupsCreated++;
      } else {
        console.error(`❌ Erro ao criar follow-up: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        total_lembretes: lembretes.length,
        enviados,
        bloqueados_antispam: bloqueados,
        followups_criados: followupsCreated,
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
