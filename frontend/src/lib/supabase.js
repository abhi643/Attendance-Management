import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cnkpxudugwmlvptpzdim.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNua3B4dWR1Z3dtbHZwdHB6ZGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NzQ3MjUsImV4cCI6MjA3MzE1MDcyNX0.6wupJ1F8A8vxXsmwsQudC1QZXmG6k_yKd-ZbZft3wzE'

export const supabase = createClient(supabaseUrl, supabaseKey)
