export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} bulunamadı`);
export const forbidden = (message = 'Bu işlem için yetkiniz yok') => new HttpError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Oturum geçersiz veya süresi dolmuş') => new HttpError(401, 'UNAUTHORIZED', message);
