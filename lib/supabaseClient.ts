import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tuysxhhlswuehadbvrdj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1eXN4aGhsd3N1ZWhhZGJ2cmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MDY5ODQsImV4cCI6MjA2MzQ4Mjk4NH0.nU4PsFFQkSGX3HYRaffr4UAPENUbq25uGrc4MJ6MKdk'

export const supabase = createClient(supabaseUrl, supabaseKey);
