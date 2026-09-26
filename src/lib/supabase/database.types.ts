// Generated from the Caryandi database schema by supabase/tests/gen_types.py.
// Do not edit by hand. Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          id: number
          admin_id: string | null
          action: string
          target_type: string
          target_id: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: number
          admin_id?: string | null
          action: string
          target_type: string
          target_id: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: number
          admin_id?: string | null
          action?: string
          target_type?: string
          target_id?: string
          details?: Json
          created_at?: string
        }
        Relationships: []
      }
      business_contacts: {
        Row: {
          business_id: string
          phone: string | null
          whatsapp_number: string | null
          email: string | null
          website: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          phone?: string | null
          whatsapp_number?: string | null
          email?: string | null
          website?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          phone?: string | null
          whatsapp_number?: string | null
          email?: string | null
          website?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          profile_id: string
          role: Database["public"]["Enums"]["business_member_role"]
          created_at: string
        }
        Insert: {
          business_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["business_member_role"]
          created_at?: string
        }
        Update: {
          business_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["business_member_role"]
          created_at?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          id: string
          owner_id: string
          business_type: Database["public"]["Enums"]["business_type"]
          name: string
          slug: string
          description: string | null
          logo_path: string | null
          cover_path: string | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          area: string | null
          address: string | null
          latitude: number | null
          longitude: number | null
          opening_hours: Json | null
          is_mobile_service: boolean
          price_from: number | null
          price_note: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          rating_avg: number
          rating_count: number
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          business_type: Database["public"]["Enums"]["business_type"]
          name: string
          slug: string
          description?: string | null
          logo_path?: string | null
          cover_path?: string | null
          province?: Database["public"]["Enums"]["zambia_province"] | null
          city?: string | null
          area?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json | null
          is_mobile_service?: boolean
          price_from?: number | null
          price_note?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          rating_avg?: number
          rating_count?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          name?: string
          slug?: string
          description?: string | null
          logo_path?: string | null
          cover_path?: string | null
          province?: Database["public"]["Enums"]["zambia_province"] | null
          city?: string | null
          area?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          opening_hours?: Json | null
          is_mobile_service?: boolean
          price_from?: number | null
          price_note?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          rating_avg?: number
          rating_count?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      contact_reveals: {
        Row: {
          id: number
          viewer_id: string
          owner_profile_id: string
          business_id: string | null
          target_type: string
          target_id: string
          created_at: string
        }
        Insert: {
          id?: number
          viewer_id: string
          owner_profile_id: string
          business_id?: string | null
          target_type: string
          target_id: string
          created_at?: string
        }
        Update: {
          id?: number
          viewer_id?: string
          owner_profile_id?: string
          business_id?: string | null
          target_type?: string
          target_id?: string
          created_at?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          profile_id: string
          last_read_at: string | null
          is_archived: boolean
          joined_at: string
        }
        Insert: {
          conversation_id: string
          profile_id: string
          last_read_at?: string | null
          is_archived?: boolean
          joined_at?: string
        }
        Update: {
          conversation_id?: string
          profile_id?: string
          last_read_at?: string | null
          is_archived?: boolean
          joined_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          created_by: string
          business_id: string | null
          vehicle_id: string | null
          part_id: string | null
          service_id: string | null
          import_route_id: string | null
          subject_label: string
          last_message_at: string
          created_at: string
        }
        Insert: {
          id?: string
          created_by: string
          business_id?: string | null
          vehicle_id?: string | null
          part_id?: string | null
          service_id?: string | null
          import_route_id?: string | null
          subject_label: string
          last_message_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          created_by?: string
          business_id?: string | null
          vehicle_id?: string | null
          part_id?: string | null
          service_id?: string | null
          import_route_id?: string | null
          subject_label?: string
          last_message_at?: string
          created_at?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          id: string
          to_email: string | null
          template: string
          subject: string
          body_text: string
          payload: Json
          status: string
          attempts: number
          last_error: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          to_email?: string | null
          template: string
          subject: string
          body_text: string
          payload?: Json
          status?: string
          attempts?: number
          last_error?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          to_email?: string | null
          template?: string
          subject?: string
          body_text?: string
          payload?: Json
          status?: string
          attempts?: number
          last_error?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      favourites: {
        Row: {
          profile_id: string
          vehicle_id: string
          created_at: string
        }
        Insert: {
          profile_id: string
          vehicle_id: string
          created_at?: string
        }
        Update: {
          profile_id?: string
          vehicle_id?: string
          created_at?: string
        }
        Relationships: []
      }
      import_routes: {
        Row: {
          id: string
          business_id: string
          origin_country: string
          transit_port: string | null
          destination_city: string
          services: string[]
          price_from: number | null
          price_note: string | null
          est_days_min: number | null
          est_days_max: number | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          origin_country: string
          transit_port?: string | null
          destination_city?: string
          services?: string[]
          price_from?: number | null
          price_note?: string | null
          est_days_min?: number | null
          est_days_max?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          origin_country?: string
          transit_port?: string | null
          destination_city?: string
          services?: string[]
          price_from?: number | null
          price_note?: string | null
          est_days_min?: number | null
          est_days_max?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      info_articles: {
        Row: {
          id: string
          slug: string
          category: string
          title: string
          summary: string | null
          body: string
          is_published: boolean
          published_at: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          category: string
          title: string
          summary?: string | null
          body?: string
          is_published?: boolean
          published_at?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          category?: string
          title?: string
          summary?: string | null
          body?: string
          is_published?: boolean
          published_at?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      meetup_requests: {
        Row: {
          id: string
          conversation_id: string
          requester_id: string
          recipient_id: string
          business_id: string | null
          vehicle_id: string | null
          part_id: string | null
          service_id: string | null
          import_route_id: string | null
          purpose: string
          proposed_time: string | null
          location_note: string | null
          message: string | null
          status: Database["public"]["Enums"]["meetup_status"]
          response_note: string | null
          responded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          requester_id: string
          recipient_id: string
          business_id?: string | null
          vehicle_id?: string | null
          part_id?: string | null
          service_id?: string | null
          import_route_id?: string | null
          purpose: string
          proposed_time?: string | null
          location_note?: string | null
          message?: string | null
          status?: Database["public"]["Enums"]["meetup_status"]
          response_note?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          requester_id?: string
          recipient_id?: string
          business_id?: string | null
          vehicle_id?: string | null
          part_id?: string | null
          service_id?: string | null
          import_route_id?: string | null
          purpose?: string
          proposed_time?: string | null
          location_note?: string | null
          message?: string | null
          status?: Database["public"]["Enums"]["meetup_status"]
          response_note?: string | null
          responded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string | null
          kind: Database["public"]["Enums"]["message_kind"]
          body: string
          meetup_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          body: string
          meetup_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          body?: string
          meetup_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          data: Json
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          type: string
          title: string
          body?: string | null
          link?: string | null
          data?: Json
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          data?: Json
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      part_categories: {
        Row: {
          id: number
          slug: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: number
          slug: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: number
          slug?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      part_images: {
        Row: {
          id: string
          part_id: string
          storage_path: string
          position: number
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          part_id: string
          storage_path: string
          position?: number
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          part_id?: string
          storage_path?: string
          position?: number
          is_primary?: boolean
          created_at?: string
        }
        Relationships: []
      }
      parts: {
        Row: {
          id: string
          owner_id: string
          business_id: string | null
          category_id: number
          title: string
          description: string | null
          price: number
          currency: string
          condition: Database["public"]["Enums"]["part_condition"]
          quantity: number
          compatibility_note: string | null
          province: Database["public"]["Enums"]["zambia_province"]
          city: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          search_text: string | null
          published_at: string | null
          sold_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          business_id?: string | null
          category_id: number
          title: string
          description?: string | null
          price: number
          currency?: string
          condition: Database["public"]["Enums"]["part_condition"]
          quantity?: number
          compatibility_note?: string | null
          province: Database["public"]["Enums"]["zambia_province"]
          city: string
          listing_status?: Database["public"]["Enums"]["listing_status"]
          search_text?: never
          published_at?: string | null
          sold_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          business_id?: string | null
          category_id?: number
          title?: string
          description?: string | null
          price?: number
          currency?: string
          condition?: Database["public"]["Enums"]["part_condition"]
          quantity?: number
          compatibility_note?: string | null
          province?: Database["public"]["Enums"]["zambia_province"]
          city?: string
          listing_status?: Database["public"]["Enums"]["listing_status"]
          search_text?: never
          published_at?: string | null
          sold_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      profile_consents: {
        Row: {
          profile_id: string
          terms_version: string
          terms_accepted_at: string
          age_confirmed_at: string
        }
        Insert: {
          profile_id: string
          terms_version: string
          terms_accepted_at?: string
          age_confirmed_at?: string
        }
        Update: {
          profile_id?: string
          terms_version?: string
          terms_accepted_at?: string
          age_confirmed_at?: string
        }
        Relationships: []
      }
      profile_contacts: {
        Row: {
          profile_id: string
          phone: string | null
          whatsapp_number: string | null
          updated_at: string
        }
        Insert: {
          profile_id: string
          phone?: string | null
          whatsapp_number?: string | null
          updated_at?: string
        }
        Update: {
          profile_id?: string
          phone?: string | null
          whatsapp_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          account_type: Database["public"]["Enums"]["account_type"]
          account_status: Database["public"]["Enums"]["account_status"]
          full_name: string
          avatar_path: string | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          bio: string | null
          rating_avg: number
          rating_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          account_type?: Database["public"]["Enums"]["account_type"]
          account_status?: Database["public"]["Enums"]["account_status"]
          full_name: string
          avatar_path?: string | null
          province?: Database["public"]["Enums"]["zambia_province"] | null
          city?: string | null
          bio?: string | null
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_type?: Database["public"]["Enums"]["account_type"]
          account_status?: Database["public"]["Enums"]["account_status"]
          full_name?: string
          avatar_path?: string | null
          province?: Database["public"]["Enums"]["zambia_province"] | null
          city?: string | null
          bio?: string | null
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: Database["public"]["Enums"]["report_target"]
          target_id: string
          category: Database["public"]["Enums"]["report_category"]
          details: string
          status: Database["public"]["Enums"]["report_status"]
          admin_notes: string | null
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reporter_id?: string
          target_type: Database["public"]["Enums"]["report_target"]
          target_id: string
          category: Database["public"]["Enums"]["report_category"]
          details: string
          status?: Database["public"]["Enums"]["report_status"]
          admin_notes?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reporter_id?: string
          target_type?: Database["public"]["Enums"]["report_target"]
          target_id?: string
          category?: Database["public"]["Enums"]["report_category"]
          details?: string
          status?: Database["public"]["Enums"]["report_status"]
          admin_notes?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          reviewer_id: string
          business_id: string | null
          seller_id: string | null
          rating: number
          body: string | null
          status: Database["public"]["Enums"]["review_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reviewer_id?: string
          business_id?: string | null
          seller_id?: string | null
          rating: number
          body?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reviewer_id?: string
          business_id?: string | null
          seller_id?: string | null
          rating?: number
          body?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          price_from: number | null
          price_note: string | null
          duration_minutes: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          description?: string | null
          price_from?: number | null
          price_note?: string | null
          duration_minutes?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          description?: string | null
          price_from?: number | null
          price_note?: string | null
          duration_minutes?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          id: string
          vehicle_id: string
          uploaded_by: string
          document_type: Database["public"]["Enums"]["vehicle_document_type"]
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          uploaded_by: string
          document_type: Database["public"]["Enums"]["vehicle_document_type"]
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          uploaded_by?: string
          document_type?: Database["public"]["Enums"]["vehicle_document_type"]
          storage_path?: string
          created_at?: string
        }
        Relationships: []
      }
      vehicle_images: {
        Row: {
          id: string
          vehicle_id: string
          storage_path: string
          position: number
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          storage_path: string
          position?: number
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          storage_path?: string
          position?: number
          is_primary?: boolean
          created_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          id: string
          owner_id: string
          business_id: string | null
          make: string
          model: string
          variant: string | null
          year: number
          price: number
          currency: string
          mileage_km: number | null
          condition: Database["public"]["Enums"]["vehicle_condition"]
          transmission: Database["public"]["Enums"]["transmission_type"]
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          engine_size_cc: number | null
          body_type: string | null
          colour: string | null
          registration_status: Database["public"]["Enums"]["registration_status"]
          duty_status: Database["public"]["Enums"]["duty_status"]
          import_status: Database["public"]["Enums"]["import_status"]
          province: Database["public"]["Enums"]["zambia_province"]
          city: string
          area: string | null
          latitude: number | null
          longitude: number | null
          description: string | null
          listing_status: Database["public"]["Enums"]["listing_status"]
          verification_status: Database["public"]["Enums"]["verification_status"]
          search_text: string | null
          published_at: string | null
          sold_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          features: string[]
        }
        Insert: {
          id?: string
          owner_id: string
          business_id?: string | null
          make: string
          model: string
          variant?: string | null
          year: number
          price: number
          currency?: string
          mileage_km?: number | null
          condition: Database["public"]["Enums"]["vehicle_condition"]
          transmission: Database["public"]["Enums"]["transmission_type"]
          fuel_type: Database["public"]["Enums"]["fuel_type"]
          engine_size_cc?: number | null
          body_type?: string | null
          colour?: string | null
          registration_status: Database["public"]["Enums"]["registration_status"]
          duty_status: Database["public"]["Enums"]["duty_status"]
          import_status?: Database["public"]["Enums"]["import_status"]
          province: Database["public"]["Enums"]["zambia_province"]
          city: string
          area?: string | null
          latitude?: number | null
          longitude?: number | null
          description?: string | null
          listing_status?: Database["public"]["Enums"]["listing_status"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
          search_text?: never
          published_at?: string | null
          sold_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          features?: string[]
        }
        Update: {
          id?: string
          owner_id?: string
          business_id?: string | null
          make?: string
          model?: string
          variant?: string | null
          year?: number
          price?: number
          currency?: string
          mileage_km?: number | null
          condition?: Database["public"]["Enums"]["vehicle_condition"]
          transmission?: Database["public"]["Enums"]["transmission_type"]
          fuel_type?: Database["public"]["Enums"]["fuel_type"]
          engine_size_cc?: number | null
          body_type?: string | null
          colour?: string | null
          registration_status?: Database["public"]["Enums"]["registration_status"]
          duty_status?: Database["public"]["Enums"]["duty_status"]
          import_status?: Database["public"]["Enums"]["import_status"]
          province?: Database["public"]["Enums"]["zambia_province"]
          city?: string
          area?: string | null
          latitude?: number | null
          longitude?: number | null
          description?: string | null
          listing_status?: Database["public"]["Enums"]["listing_status"]
          verification_status?: Database["public"]["Enums"]["verification_status"]
          search_text?: never
          published_at?: string | null
          sold_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          features?: string[]
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          id: string
          request_id: string
          document_type: Database["public"]["Enums"]["admin_document_type"]
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          document_type: Database["public"]["Enums"]["admin_document_type"]
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          document_type?: Database["public"]["Enums"]["admin_document_type"]
          storage_path?: string
          created_at?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          id: string
          requester_id: string
          subject: Database["public"]["Enums"]["verification_subject"]
          business_id: string | null
          vehicle_id: string | null
          selfie_path: string | null
          selfie_captured_at: string | null
          requester_notes: string | null
          status: Database["public"]["Enums"]["verification_status"]
          reviewed_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          subject: Database["public"]["Enums"]["verification_subject"]
          business_id?: string | null
          vehicle_id?: string | null
          selfie_path?: string | null
          selfie_captured_at?: string | null
          requester_notes?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          reviewed_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          subject?: Database["public"]["Enums"]["verification_subject"]
          business_id?: string | null
          vehicle_id?: string | null
          selfie_path?: string | null
          selfie_captured_at?: string | null
          requester_notes?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          reviewed_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_audit_feed: {
        Row: {
          id: number | null
          action: string | null
          target_type: string | null
          target_id: string | null
          details: Json | null
          created_at: string | null
          admin_name: string | null
        }
        Relationships: []
      }
      admin_businesses: {
        Row: {
          id: string | null
          name: string | null
          slug: string | null
          business_type: Database["public"]["Enums"]["business_type"] | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          verification_status: Database["public"]["Enums"]["verification_status"] | null
          is_active: boolean | null
          rating_avg: number | null
          rating_count: number | null
          created_at: string | null
          owner_id: string | null
          owner_name: string | null
          owner_status: Database["public"]["Enums"]["account_status"] | null
          live_vehicles: number | null
          live_parts: number | null
          active_services: number | null
          active_routes: number | null
        }
        Relationships: []
      }
      admin_listings: {
        Row: {
          listing_type: string | null
          id: string | null
          title: string | null
          price: number | null
          listing_status: Database["public"]["Enums"]["listing_status"] | null
          verification_status: Database["public"]["Enums"]["verification_status"] | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          owner_id: string | null
          seller_name: string | null
          created_at: string | null
          published_at: string | null
        }
        Relationships: []
      }
      admin_reports: {
        Row: {
          id: string | null
          target_type: Database["public"]["Enums"]["report_target"] | null
          target_id: string | null
          category: Database["public"]["Enums"]["report_category"] | null
          details: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          admin_notes: string | null
          created_at: string | null
          updated_at: string | null
          resolved_at: string | null
          reporter_id: string | null
          reporter_name: string | null
          resolved_by_name: string | null
          target_label: string | null
          reports_on_target: number | null
        }
        Relationships: []
      }
      admin_reviews: {
        Row: {
          id: string | null
          rating: number | null
          body: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          created_at: string | null
          updated_at: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          business_id: string | null
          seller_id: string | null
          subject_name: string | null
          subject_business_type: Database["public"]["Enums"]["business_type"] | null
          subject_slug: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          id: string | null
          full_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          account_status: Database["public"]["Enums"]["account_status"] | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          created_at: string | null
          rating_avg: number | null
          rating_count: number | null
          business_id: string | null
          business_name: string | null
          business_slug: string | null
          live_vehicles: number | null
          live_parts: number | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          id: string | null
          conversation_id: string | null
          sender_id: string | null
          is_mine: boolean | null
          sender_name: string | null
          kind: Database["public"]["Enums"]["message_kind"] | null
          body: string | null
          meetup_id: string | null
          meetup_status: Database["public"]["Enums"]["meetup_status"] | null
          meetup_proposed_time: string | null
          meetup_requester_id: string | null
          created_at: string | null
        }
        Relationships: []
      }
      inbox: {
        Row: {
          id: string | null
          subject_label: string | null
          business_id: string | null
          vehicle_id: string | null
          part_id: string | null
          service_id: string | null
          import_route_id: string | null
          created_by: string | null
          started_by_me: boolean | null
          last_message_at: string | null
          created_at: string | null
          last_read_at: string | null
          is_archived: boolean | null
          last_body: string | null
          last_kind: Database["public"]["Enums"]["message_kind"] | null
          last_from_me: boolean | null
          unread_count: number | null
          counterpart_name: string | null
        }
        Relationships: []
      }
      meetup_request_details: {
        Row: {
          id: string | null
          conversation_id: string | null
          requester_id: string | null
          recipient_id: string | null
          business_id: string | null
          vehicle_id: string | null
          part_id: string | null
          service_id: string | null
          import_route_id: string | null
          purpose: string | null
          proposed_time: string | null
          location_note: string | null
          message: string | null
          status: Database["public"]["Enums"]["meetup_status"] | null
          response_note: string | null
          responded_at: string | null
          created_at: string | null
          is_mine: boolean | null
          subject_label: string | null
          requester_name: string | null
          recipient_name: string | null
        }
        Relationships: []
      }
      part_listings: {
        Row: {
          id: string | null
          owner_id: string | null
          business_id: string | null
          category_id: number | null
          category_slug: string | null
          category_name: string | null
          title: string | null
          description: string | null
          price: number | null
          currency: string | null
          condition: Database["public"]["Enums"]["part_condition"] | null
          quantity: number | null
          compatibility_note: string | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          listing_status: Database["public"]["Enums"]["listing_status"] | null
          search_text: string | null
          published_at: string | null
          created_at: string | null
          updated_at: string | null
          seller_name: string | null
          business_slug: string | null
          is_verified: boolean | null
          primary_image_path: string | null
        }
        Relationships: []
      }
      review_feed: {
        Row: {
          id: string | null
          business_id: string | null
          seller_id: string | null
          rating: number | null
          body: string | null
          created_at: string | null
          reviewer_name: string | null
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          id: string | null
          slug: string | null
          name: string | null
          business_type: Database["public"]["Enums"]["business_type"] | null
          description: string | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          area: string | null
          address: string | null
          latitude: number | null
          longitude: number | null
          logo_path: string | null
          cover_path: string | null
          opening_hours: Json | null
          is_mobile_service: boolean | null
          price_from: number | null
          price_note: string | null
          is_verified: boolean | null
          rating_avg: number | null
          rating_count: number | null
          created_at: string | null
          service_names: string[] | null
          service_count: number | null
          min_service_price: number | null
          route_labels: string[] | null
          route_count: number | null
          min_route_price: number | null
        }
        Relationships: []
      }
      vehicle_listings: {
        Row: {
          id: string | null
          owner_id: string | null
          business_id: string | null
          make: string | null
          model: string | null
          variant: string | null
          year: number | null
          price: number | null
          currency: string | null
          mileage_km: number | null
          condition: Database["public"]["Enums"]["vehicle_condition"] | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          fuel_type: Database["public"]["Enums"]["fuel_type"] | null
          engine_size_cc: number | null
          body_type: string | null
          colour: string | null
          registration_status: Database["public"]["Enums"]["registration_status"] | null
          duty_status: Database["public"]["Enums"]["duty_status"] | null
          import_status: Database["public"]["Enums"]["import_status"] | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          area: string | null
          latitude: number | null
          longitude: number | null
          description: string | null
          listing_status: Database["public"]["Enums"]["listing_status"] | null
          search_text: string | null
          published_at: string | null
          sold_at: string | null
          created_at: string | null
          updated_at: string | null
          is_verified: boolean | null
          seller_name: string | null
          seller_type: string | null
          business_slug: string | null
          seller_rating_avg: number | null
          seller_rating_count: number | null
          primary_image_path: string | null
          features: string[] | null
          seller_is_verified: boolean | null
        }
        Relationships: []
      }
      vehicle_make_counts: {
        Row: {
          make: string | null
          listing_count: number | null
        }
        Relationships: []
      }
      vehicle_sellers: {
        Row: {
          seller_kind: string | null
          id: string | null
          slug: string | null
          name: string | null
          seller_type: string | null
          province: Database["public"]["Enums"]["zambia_province"] | null
          city: string | null
          area: string | null
          image_path: string | null
          about: string | null
          is_verified: boolean | null
          rating_avg: number | null
          rating_count: number | null
          active_vehicle_count: number | null
          created_at: string | null
        }
        Relationships: []
      }
      verification_request_details: {
        Row: {
          id: string | null
          requester_id: string | null
          subject: Database["public"]["Enums"]["verification_subject"] | null
          business_id: string | null
          vehicle_id: string | null
          selfie_path: string | null
          selfie_captured_at: string | null
          requester_notes: string | null
          status: Database["public"]["Enums"]["verification_status"] | null
          review_notes: string | null
          reviewed_at: string | null
          created_at: string | null
          requester_name: string | null
          requester_account_type: Database["public"]["Enums"]["account_type"] | null
          business_name: string | null
          business_type: Database["public"]["Enums"]["business_type"] | null
          business_verification_status: Database["public"]["Enums"]["verification_status"] | null
          vehicle_year: number | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_variant: string | null
          vehicle_registration_status: Database["public"]["Enums"]["registration_status"] | null
          vehicle_duty_status: Database["public"]["Enums"]["duty_status"] | null
          vehicle_import_status: Database["public"]["Enums"]["import_status"] | null
          vehicle_listing_status: Database["public"]["Enums"]["listing_status"] | null
          document_count: number | null
          reviewer_name: string | null
          vehicle_business_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_terms: {
        Args: {
          p_version: string
          p_confirm_adult: boolean
        }
        Returns: undefined
      }
      admin_get_scam_report_details: {
        Args: {
          p_report_id: string
        }
        Returns: Json
      }
      admin_moderate_review: {
        Args: {
          p_review_id: string
          p_status: Database["public"]["Enums"]["review_status"]
          p_reason?: string
        }
        Returns: undefined
      }
      admin_platform_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_review_verification: {
        Args: {
          p_request_id: string
          p_decision: Database["public"]["Enums"]["verification_status"]
          p_notes?: string
        }
        Returns: undefined
      }
      admin_set_account_status: {
        Args: {
          p_profile_id: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_reason: string
        }
        Returns: undefined
      }
      admin_set_business_active: {
        Args: {
          p_business_id: string
          p_active: boolean
          p_reason: string
        }
        Returns: undefined
      }
      admin_set_listing_status: {
        Args: {
          p_listing_type: string
          p_listing_id: string
          p_status: Database["public"]["Enums"]["listing_status"]
          p_reason?: string
        }
        Returns: undefined
      }
      admin_update_report: {
        Args: {
          p_report_id: string
          p_status: Database["public"]["Enums"]["report_status"]
          p_notes?: string
        }
        Returns: undefined
      }
      claim_email_batch: {
        Args: {
          p_limit?: number
        }
        Returns: unknown[]
      }
      complete_email: {
        Args: {
          p_id: string
          p_sent: boolean
          p_error?: string
        }
        Returns: undefined
      }
      get_contact: {
        Args: {
          p_target_type: string
          p_target_id: string
        }
        Returns: {
          display_name: string | null
          phone: string | null
          whatsapp_number: string | null
          whatsapp_link: string | null
        }[]
      }
      mark_conversation_read: {
        Args: {
          p_conversation_id: string
        }
        Returns: undefined
      }
      my_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      my_vehicle_verification: {
        Args: {
          p_vehicle_id: string
        }
        Returns: {
          can_verify: boolean | null
          status: Database["public"]["Enums"]["verification_status"] | null
        }[]
      }
      request_meetup: {
        Args: {
          p_target_type: string
          p_target_id: string
          p_proposed_time?: string
          p_location_note?: string
          p_message?: string
        }
        Returns: string
      }
      respond_meetup: {
        Args: {
          p_meetup_id: string
          p_status: Database["public"]["Enums"]["meetup_status"]
          p_note?: string
        }
        Returns: undefined
      }
      review_eligibility: {
        Args: {
          p_business_id?: string
          p_seller_id?: string
        }
        Returns: Json
      }
      start_conversation: {
        Args: {
          p_target_type: string
          p_target_id: string
          p_message?: string
        }
        Returns: string
      }
      submit_vehicle_verification: {
        Args: {
          p_vehicle_id: string
          p_documents: Json
          p_notes?: string
        }
        Returns: string
      }
      vehicle_document_summary: {
        Args: {
          p_vehicle_id: string
        }
        Returns: {
          document_type: Database["public"]["Enums"]["vehicle_document_type"] | null
          provided_at: string | null
        }[]
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "banned"
      account_type: "buyer" | "private_seller" | "dealer" | "mechanic" | "servicing_company" | "parts_seller" | "import_agent" | "admin"
      admin_document_type: "national_id" | "passport" | "business_registration" | "tax_certificate" | "other" | "registration_book" | "import_papers" | "customs_clearance" | "police_clearance"
      business_member_role: "owner" | "manager" | "staff"
      business_type: "dealer" | "mechanic" | "servicing_company" | "parts_seller" | "import_agent"
      duty_status: "paid" | "unpaid"
      fuel_type: "petrol" | "diesel" | "hybrid" | "electric" | "other"
      import_status: "local" | "imported"
      listing_status: "draft" | "pending" | "active" | "sold" | "archived" | "rejected"
      meetup_status: "pending" | "accepted" | "declined" | "cancelled" | "completed"
      message_kind: "text" | "meetup_request" | "meetup_update" | "system"
      part_condition: "new" | "used" | "reconditioned"
      registration_status: "registered" | "unregistered"
      report_category: "scam" | "misleading_listing" | "inappropriate_content" | "spam" | "other"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      report_target: "vehicle" | "part" | "business" | "profile" | "review" | "message"
      review_status: "published" | "hidden"
      transmission_type: "automatic" | "manual"
      vehicle_condition: "new" | "used_excellent" | "used_good" | "used_fair" | "needs_repair"
      vehicle_document_type: "registration_certificate" | "import_declaration" | "duty_receipt" | "road_tax" | "other"
      verification_status: "unverified" | "pending" | "approved" | "rejected"
      verification_subject: "business" | "vehicle"
      zambia_province: "central" | "copperbelt" | "eastern" | "luapula" | "lusaka" | "muchinga" | "northern" | "north_western" | "southern" | "western"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
