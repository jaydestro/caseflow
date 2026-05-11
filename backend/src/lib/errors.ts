export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (msg = 'not found') => new HttpError(404, msg);
export const badRequest = (msg = 'bad request') => new HttpError(400, msg);
