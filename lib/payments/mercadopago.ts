import { MercadoPagoConfig } from 'mercadopago';

/**
 * Singleton del cliente de Mercado Pago para el backend.
 * Configuración centralizada para cobros en Argentina.
 */
export const mpClient = process.env.MERCADOPAGO_ACCESS_TOKEN 
  ? new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
      options: { timeout: 5000 },
    })
  : null;
