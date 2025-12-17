import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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
    console.log(`📊 Gerando resumo semanal em ${agora.toISOString()}`);

    // Calcular próximos 7 dias
    const dataInicio = new Date(agora);
    dataInicio.setDate(dataInicio.getDate() + 1);
    const dataFim = new Date(agora);
    dataFim.setDate(dataFim.getDate() + 7);

    // Buscar usuários ativos
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
      // Buscar eventos da próxima semana
      const { data: eventosSemana } = await supabase
        .from('eventos')
        .select('titulo, data, tipo, pessoa')
        .eq('usuario_id', usuario.usuario_id)
        .gte('data', dataInicio.toISOString().split('T')[0])
        .lte('data', dataFim.toISOString().split('T')[0])
        .order('data', { ascending: true });

      let mensagem: string;

      if (eventosSemana && eventosSemana.length > 0) {
        // Agrupar por dia
        const porDia: { [key: string]: string[] } = {};
        
        for (const evento of eventosSemana) {
          const dataEvento = new Date(evento.data);
          const diaSemana = diasSemana[dataEvento.getDay()];
          const diaNumero = dataEvento.getDate();
          const chave = `${diaSemana} (${diaNumero})`;
          
          if (!porDia[chave]) {
            porDia[chave] = [];
          }

          const hora = dataEvento.getHours();
          const minuto = dataEvento.getMinutes();
          const horaTexto = hora === 0 && minuto === 0 
            ? '' 
            : ` ${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;
          
          const titulo = evento.tipo === 'aniversario' 
            ? `🎂 ${evento.pessoa}`
            : evento.titulo;
          
          porDia[chave].push(`${horaTexto}${horaTexto ? ' -' : '•'} ${titulo}`);
        }

        // Formatar mensagem
        const linhas = Object.entries(porDia).map(([dia, eventos]) => {
          return `📌 ${dia}:\n${eventos.map(e => `  ${e}`).join('\n')}`;
        });

        mensagem = `📊 Sua semana:\n\n${linhas.join('\n\n')}`;
      } else {
        mensagem = `📊 Sua semana está livre! Sem compromissos agendados.`;
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
          console.log(`✅ Resumo enviado para ${usuario.whatsapp}`);
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
