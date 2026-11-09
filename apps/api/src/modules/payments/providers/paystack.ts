import crypto from 'node:crypto';
import type { PaymentGateway, PaymentInitParams, PaymentInitResult } from './types.js';

export interface PaystackConfig {
  secretKey: string;
}

export function createPaystackGateway(config: PaystackConfig): PaymentGateway {
  return {
    name: 'paystack',
    async initialize(params: PaymentInitParams): Promise<PaymentInitResult> {
      // Paystack amounts are in kobo (1 NGN = 100 kobo)
      const res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100),
          email: params.email,
          reference: params.reference,
          callback_url: params.callbackUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(`Paystack initialization failed with status ${res.status}`);
      }

      const body = (await res.json()) as {
        status: boolean;
        data: { authorization_url: string; access_code: string; reference: string };
      };

      return {
        authorizationUrl: body.data.authorization_url,
        accessCode: body.data.access_code,
        reference: body.data.reference,
      };
    },
    verifySignature(signature: string, payload: unknown): boolean {
      const hash = crypto
        .createHmac('sha512', config.secretKey)
        .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
        .digest('hex');
      return hash === signature;
    },
  };
}
