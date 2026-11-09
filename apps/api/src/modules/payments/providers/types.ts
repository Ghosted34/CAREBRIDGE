export interface PaymentInitParams {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  callbackUrl?: string;
}

export interface PaymentInitResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaymentGateway {
  name: string;
  initialize(params: PaymentInitParams): Promise<PaymentInitResult>;
  verifySignature(signature: string, payload: unknown): boolean;
}
