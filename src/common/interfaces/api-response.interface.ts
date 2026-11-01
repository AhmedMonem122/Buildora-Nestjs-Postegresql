export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorMeta {
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetails;
  meta: ApiErrorMeta;
}
