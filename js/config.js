/* Knowledge Base settings — edit the values between the quotes only (keep the commas and braces).
   Supabase → Project Settings → Data API (URL) and API Keys → Legacy → "anon public" key.
   Use the anon key only — never the service_role key (this file is public). */
window.KB_CONFIG = {
  supabaseUrl: 'https://vawcsvpvwepkogkfluda.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd2NzdnB2d2Vwa29na2ZsdWRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzQ0OTUsImV4cCI6MjEwNjMxMDQ5NX0.eNrehZgJB_2FSn4sFi5PtS9YpKkw9LKfbqraYC6c_6k',
  // Logins and roles come from OnePopHealth (Admin Dashboard → Users).
  usersUrl: 'https://pophealth-odc.github.io/onepophealth/data/users.json'
};
