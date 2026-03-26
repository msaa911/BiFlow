import Stripe from 'stripe';

/**
 * Singleton del cliente de Stripe para el backend.
 * Asegura que no se instancien múltiples conexiones innecesarias.
 */
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia' as any,
      appInfo: {
        name: 'BiFlow Admin',
        version: '0.1.0',
      },
    })
  : null;
