export class DeskError extends Error {
  constructor(
    message: string,
    readonly code: DeskErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DeskError';
  }
}

export type DeskErrorCode =
  | 'not_found'
  | 'validation_failed'
  | 'unknown_plugin'
  | 'illegal_state'
  | 'unauthorized';

export const notFound = (msg: string) => new DeskError(msg, 'not_found', 404);
export const validationFailed = (msg: string) => new DeskError(msg, 'validation_failed', 400);
export const unknownPlugin = (msg: string) => new DeskError(msg, 'unknown_plugin', 400);
export const illegalState = (msg: string) => new DeskError(msg, 'illegal_state', 409);
