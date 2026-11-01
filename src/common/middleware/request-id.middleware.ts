import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants/app.constants.js';

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assigns a correlation id to every request. Incoming ids are accepted only
 * when they match a conservative format, which prevents header/log injection.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header(REQUEST_ID_HEADER);
  const requestId =
    req.requestId ??
    (incomingRequestId && VALID_REQUEST_ID.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID());

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
