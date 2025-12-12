export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public error: string = 'Error'
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: this.error,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message, 'Not Found');
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message, 'Validation Error');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'Unauthorized');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'Forbidden');
  }
}
