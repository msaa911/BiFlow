/**
 * Diagnostic script for Payment Gateways initialization.
 * Following project root hygiene rules (Sprint 6).
 */
import { stripe } from '../../lib/payments/stripe';
import { mercadopago } from '../../lib/payments/mercadopago';

async function testInit() {
  console.log('--- Payment Gateways Diagnostics ---');
  
  try {
    console.log('Checking Stripe initialization...');
    if (stripe) {
      console.log('✅ Stripe instance created (SDK v21.x)');
    }
  } catch (error: any) {
    console.error('❌ Stripe init error (Expected if STRIPE_SECRET_KEY missing):', error.message);
  }

  try {
    console.log('Checking Mercado Pago initialization...');
    if (mercadopago) {
      console.log('✅ Mercado Pago instance created (SDK v2.x)');
    }
  } catch (error: any) {
    console.error('❌ Mercado Pago init error (Expected if TOKEN missing):', error.message);
  }
}

testInit();
