import jwt from 'jsonwebtoken';
import fs from 'fs';

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb2tmcGhhZ3pjaXRvc3Vwa291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODE4ODAsImV4cCI6MjA5ODQ1Nzg4MH0.IsJYgKjF6YnkGdNb3d7EjGo-WY_KjEDPWlkwOUuhcR8"; // This is the ANON key, not the user token! Wait, the anon key is signed with the JWT secret.
const secret = "aYrAtYkbCUVPUWGqrxDUM/7/GXkke+IXMgYZYu3DJCPDCGJMoFUe+VNwJJW+B/qH9ZS6Gaa8l8d+8jX74E7VLA==";

try {
  console.log("Trying raw string...");
  const decoded = jwt.verify(token, secret);
  console.log("Raw string succeeded!", decoded);
} catch (e) {
  console.log("Raw string failed:", e.message);
  try {
    console.log("Trying base64...");
    const decoded2 = jwt.verify(token, Buffer.from(secret, 'base64'));
    console.log("Base64 succeeded!", decoded2);
  } catch (e2) {
    console.log("Base64 failed:", e2.message);
  }
}
