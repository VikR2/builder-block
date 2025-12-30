export enum ErrorCode {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  MISSING_FIELDS = 'MISSING_FIELDS',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  details?: any;
}

export function createError(code: ErrorCode, technicalMessage: string, details?: any): AppError {
  const userMessages: Record<ErrorCode, string> = {
    [ErrorCode.FILE_TOO_LARGE]: 'File size exceeds the maximum limit of 10 MB',
    [ErrorCode.INVALID_FILE_TYPE]: 'Only .cs files are supported',
    [ErrorCode.DATABASE_ERROR]: 'Database operation failed. Please try again',
    [ErrorCode.FILE_SYSTEM_ERROR]: 'Failed to save file to disk',
    [ErrorCode.MISSING_FIELDS]: 'Required fields are missing',
  };

  return {
    code,
    message: technicalMessage,
    userMessage: userMessages[code] || 'An unexpected error occurred',
    details,
  };
}
