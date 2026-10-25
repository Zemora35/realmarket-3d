import { randomBytes } from 'node:crypto';

export interface ChargeRequest {
  orderNumber: string;
  amountKurus: number;
  currency: 'TRY';
}

export interface ChargeResult {
  ok: boolean;
  reference: string;
  message?: string;
}

/**
 * Ödeme sağlayıcı arayüzü. Gerçek bir sağlayıcı (iyzico, PayTR, Stripe vb.) eklenirken
 * kart verisi hiçbir zaman bu sunucuya gelmemeli; sağlayıcının barındırılan ödeme sayfası
 * veya tokenizasyonu kullanılmalı, sonuç webhook ile doğrulanmalıdır.
 */
export interface PaymentProvider {
  id: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

/** DEMO: gerçek ödeme almaz, her zaman başarılı döner. */
export class DemoPaymentProvider implements PaymentProvider {
  id = 'demo';
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    if (!Number.isInteger(req.amountKurus) || req.amountKurus < 0) return { ok: false, reference: '', message: 'Geçersiz tutar' };
    return { ok: true, reference: `DEMO-${randomBytes(5).toString('hex').toUpperCase()}` };
  }
}
