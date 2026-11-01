declare global {
  namespace Express {
    interface Request {
      /** Correlation identifier assigned by the request-id middleware. */
      requestId?: string;
    }
  }
}

export {};
