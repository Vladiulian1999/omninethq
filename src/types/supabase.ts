// src/types/supabase.ts

export interface Database {
  public: {
    Tables: {
      availability: {
        Row: {
          id: string
          user_id: string
          tag_id: string
          day_of_week: string
          start_time: string
          end_time: string
          created_at: string
        }
        Insert: {
          user_id: string
          tag_id: string
          day_of_week: string
          start_time: string
          end_time: string
        }
        Update: {
          user_id?: string
          tag_id?: string
          day_of_week?: string
          start_time?: string
          end_time?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
