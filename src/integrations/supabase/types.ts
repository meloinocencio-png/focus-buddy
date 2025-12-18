export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      configuracao_lembretes: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          hora_lembrete_diario: string
          id: string
          notificacoes_ativas: boolean
          usuario_id: string
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          hora_lembrete_diario?: string
          id?: string
          notificacoes_ativas?: boolean
          usuario_id: string
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          hora_lembrete_diario?: string
          id?: string
          notificacoes_ativas?: boolean
          usuario_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      conversas: {
        Row: {
          contexto: Json | null
          criada_em: string | null
          id: string
          mensagem_malu: string
          mensagem_usuario: string
          usuario_id: string | null
          whatsapp_de: string
          zapi_message_id: string | null
        }
        Insert: {
          contexto?: Json | null
          criada_em?: string | null
          id?: string
          mensagem_malu: string
          mensagem_usuario: string
          usuario_id?: string | null
          whatsapp_de: string
          zapi_message_id?: string | null
        }
        Update: {
          contexto?: Json | null
          criada_em?: string | null
          id?: string
          mensagem_malu?: string
          mensagem_usuario?: string
          usuario_id?: string | null
          whatsapp_de?: string
          zapi_message_id?: string | null
        }
        Relationships: []
      }
      eventos: {
        Row: {
          checklist: Json | null
          criado_em: string | null
          data: string
          descricao: string | null
          eh_recorrente: boolean | null
          endereco: string | null
          id: string
          lembretes: Json | null
          origem_viagem: string | null
          pessoa: string | null
          recorrencia_id: string | null
          status: string | null
          tempo_viagem_minutos: number | null
          tipo: string
          titulo: string
          ultimo_calculo_viagem: string | null
          usuario_id: string
        }
        Insert: {
          checklist?: Json | null
          criado_em?: string | null
          data: string
          descricao?: string | null
          eh_recorrente?: boolean | null
          endereco?: string | null
          id?: string
          lembretes?: Json | null
          origem_viagem?: string | null
          pessoa?: string | null
          recorrencia_id?: string | null
          status?: string | null
          tempo_viagem_minutos?: number | null
          tipo: string
          titulo: string
          ultimo_calculo_viagem?: string | null
          usuario_id: string
        }
        Update: {
          checklist?: Json | null
          criado_em?: string | null
          data?: string
          descricao?: string | null
          eh_recorrente?: boolean | null
          endereco?: string | null
          id?: string
          lembretes?: Json | null
          origem_viagem?: string | null
          pessoa?: string | null
          recorrencia_id?: string | null
          status?: string | null
          tempo_viagem_minutos?: number | null
          tipo?: string
          titulo?: string
          ultimo_calculo_viagem?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "eventos_recorrencia"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_ocorrencia: {
        Row: {
          criado_em: string | null
          data_ocorrencia: string
          evento_id: string
          excluido: boolean | null
          id: string
          recorrencia_id: string
        }
        Insert: {
          criado_em?: string | null
          data_ocorrencia: string
          evento_id: string
          excluido?: boolean | null
          id?: string
          recorrencia_id: string
        }
        Update: {
          criado_em?: string | null
          data_ocorrencia?: string
          evento_id?: string
          excluido?: boolean | null
          id?: string
          recorrencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_ocorrencia_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_ocorrencia_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "eventos_recorrencia"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_recorrencia: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          data_fim: string | null
          data_inicio: string
          dia_mes: number | null
          dias_semana: number[] | null
          evento_original_id: string
          frequencia: string
          id: string
          intervalo: number | null
          numero_ocorrencias: number | null
          usuario_id: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          data_fim?: string | null
          data_inicio: string
          dia_mes?: number | null
          dias_semana?: number[] | null
          evento_original_id: string
          frequencia: string
          id?: string
          intervalo?: number | null
          numero_ocorrencias?: number | null
          usuario_id: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_mes?: number | null
          dias_semana?: number[] | null
          evento_original_id?: string
          frequencia?: string
          id?: string
          intervalo?: number | null
          numero_ocorrencias?: number | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_recorrencia_evento_original_id_fkey"
            columns: ["evento_original_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_enviados: {
        Row: {
          enviado_em: string | null
          evento_id: string
          id: string
          tipo_lembrete: string
        }
        Insert: {
          enviado_em?: string | null
          evento_id: string
          id?: string
          tipo_lembrete: string
        }
        Update: {
          enviado_em?: string | null
          evento_id?: string
          id?: string
          tipo_lembrete?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_enviados_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_followup: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          concluido: boolean | null
          criado_em: string | null
          data_limite: string | null
          evento_id: string
          id: string
          intervalo_atual: number | null
          max_dias: number | null
          max_tentativas: number | null
          proxima_pergunta: string
          tentativas: number | null
          ultima_pergunta: string | null
          usuario_id: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          concluido?: boolean | null
          criado_em?: string | null
          data_limite?: string | null
          evento_id: string
          id?: string
          intervalo_atual?: number | null
          max_dias?: number | null
          max_tentativas?: number | null
          proxima_pergunta: string
          tentativas?: number | null
          ultima_pergunta?: string | null
          usuario_id: string
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          concluido?: boolean | null
          criado_em?: string | null
          data_limite?: string | null
          evento_id?: string
          id?: string
          intervalo_atual?: number | null
          max_dias?: number | null
          max_tentativas?: number | null
          proxima_pergunta?: string
          tentativas?: number | null
          ultima_pergunta?: string | null
          usuario_id?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_followup_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_respostas: {
        Row: {
          evento_id: string
          followup_id: string
          id: string
          respondido_em: string | null
          resposta_classificada: string | null
          resposta_usuario: string
        }
        Insert: {
          evento_id: string
          followup_id: string
          id?: string
          respondido_em?: string | null
          resposta_classificada?: string | null
          resposta_usuario: string
        }
        Update: {
          evento_id?: string
          followup_id?: string
          id?: string
          respondido_em?: string | null
          resposta_classificada?: string | null
          resposta_usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_respostas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembretes_respostas_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "lembretes_followup"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_snooze: {
        Row: {
          criado_em: string | null
          enviado: boolean | null
          enviar_em: string
          evento_id: string | null
          id: string
          mensagem: string
          usuario_id: string
          whatsapp: string
        }
        Insert: {
          criado_em?: string | null
          enviado?: boolean | null
          enviar_em: string
          evento_id?: string | null
          id?: string
          mensagem: string
          usuario_id: string
          whatsapp: string
        }
        Update: {
          criado_em?: string | null
          enviado?: boolean | null
          enviar_em?: string
          evento_id?: string | null
          id?: string
          mensagem?: string
          usuario_id?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_snooze_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      locais_favoritos: {
        Row: {
          apelido: string
          atualizado_em: string | null
          criado_em: string | null
          endereco: string
          id: string
          usuario_id: string
        }
        Insert: {
          apelido: string
          atualizado_em?: string | null
          criado_em?: string | null
          endereco: string
          id?: string
          usuario_id: string
        }
        Update: {
          apelido?: string
          atualizado_em?: string | null
          criado_em?: string | null
          endereco?: string
          id?: string
          usuario_id?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          criada_em: string | null
          evento_id: string | null
          id: string
          lida: boolean
          mensagem: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          criada_em?: string | null
          evento_id?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          tipo: string
          usuario_id: string
        }
        Update: {
          criada_em?: string | null
          evento_id?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_stats: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          dias_seguidos: number | null
          first_event_source: string | null
          melhor_sequencia: number | null
          onboarding_completed_at: string | null
          onboarding_skipped: boolean | null
          total_concluidos: number | null
          ultima_atividade: string | null
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          dias_seguidos?: number | null
          first_event_source?: string | null
          melhor_sequencia?: number | null
          onboarding_completed_at?: string | null
          onboarding_skipped?: boolean | null
          total_concluidos?: number | null
          ultima_atividade?: string | null
          usuario_id: string
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          dias_seguidos?: number | null
          first_event_source?: string | null
          melhor_sequencia?: number | null
          onboarding_completed_at?: string | null
          onboarding_skipped?: boolean | null
          total_concluidos?: number | null
          ultima_atividade?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      whatsapp_usuarios: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          id: string
          nome: string | null
          primeiro_evento_criado_em: string | null
          tempo_ate_ativacao_segundos: number | null
          usuario_id: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome?: string | null
          primeiro_evento_criado_em?: string | null
          tempo_ate_ativacao_segundos?: number | null
          usuario_id: string
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          id?: string
          nome?: string | null
          primeiro_evento_criado_em?: string | null
          tempo_ate_ativacao_segundos?: number | null
          usuario_id?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
