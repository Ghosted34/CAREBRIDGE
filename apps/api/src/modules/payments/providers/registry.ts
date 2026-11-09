import { mockPaymentGateway } from './mock.js';
import { createPaystackGateway } from './paystack.js';
import type { PaymentGateway } from './types.js';

let gatewayInstance: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (gatewayInstance) return gatewayInstance;

  const providerType = process.env.PAYMENT_GATEWAY ?? 'mock';
  if (providerType === 'paystack' && process.env.PAYSTACK_SECRET_KEY) {
    gatewayInstance = createPaystackGateway({
      secretKey: process.env.PAYSTACK_SECRET_KEY,
    });
  } else {
    gatewayInstance = mockPaymentGateway;
  }

  return gatewayInstance;
}
