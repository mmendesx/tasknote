// API error shape — matches the global error filter output from the NestJS app.
// This is a plain TS type; it describes API error responses, not input to validate.

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}
