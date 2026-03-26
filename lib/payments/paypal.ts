/**
 * Configuración del cliente de PayPal para el backend.
 * Nota: Dado que no se ha especificado un SDK oficial (e.g. @paypal/checkout-server-sdk), 
 * este singleton gestiona las credenciales y el endpoint base para llamadas vía REST.
 */
export const paypalConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  apiBase: process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com', // Entorno por defecto: Sandbox
};

if (!paypalConfig.clientId || !paypalConfig.clientSecret) {
  // Solo lanzamos advertencia en lugar de error fatal para no romper el inicio si no es obligatorio
  console.warn('[PAYPAL] Credenciales no detectadas. Las funciones internacionales estarán limitadas.');
}

/**
 * Función helper para obtener el Access Token de PayPal (OAuth 2.0).
 * Se puede importar y usar en server actions o cron jobs.
 */
export async function getPayPalAccessToken() {
  const auth = Buffer.from(`${paypalConfig.clientId}:${paypalConfig.clientSecret}`).toString('base64');
  
  const response = await fetch(`${paypalConfig.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error(`[PAYPAL] Error de autenticación: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}
