import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bkokfphagzcitosupkou.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb2tmcGhhZ3pjaXRvc3Vwa291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODE4ODAsImV4cCI6MjA5ODQ1Nzg4MH0.IsJYgKjF6YnkGdNb3d7EjGo-WY_KjEDPWlkwOUuhcR8'
);

async function test() {
  const email = `test-${Date.now()}@example.com`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: 'password123'
  });
  if (error) {
    console.error('Error signing up:', error);
    return;
  }
  const token = data.session?.access_token;
  if (!token) {
    console.error('No token returned! Maybe email confirmation is required.');
    return;
  }
  
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  console.log('Decoded Payload:', payload);
}

test();
