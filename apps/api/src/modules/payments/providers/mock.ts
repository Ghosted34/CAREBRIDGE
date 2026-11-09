import type { PaymentGateway, PaymentInitParams, PaymentInitResult } from './types.js';

export const mockPaymentGateway: PaymentGateway = {
  name: 'mock',
  async initialize(params: PaymentInitParams): Promise<PaymentInitResult> {
    return {
      authorizationUrl: `/patient/payments/checkout-mock?reference=${encodeURIComponent(params.reference)}&amount=${params.amount}`,
      accessCode: `mock_code_${params.reference}`,
      reference: params.reference,
    };
  },
  verifySignature() {
    return true;
  },
};
