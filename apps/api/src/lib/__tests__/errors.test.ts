import { describe, it, expect } from 'vitest';
import {
  ApiError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from '../errors';

describe('Error Classes', () => {
  describe('ApiError', () => {
    it('should create an error with status code and message', () => {
      const error = new ApiError(500, 'Internal server error');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Internal server error');
      expect(error.error).toBe('Error');
      expect(error.name).toBe('ApiError');
    });

    it('should create an error with custom error type', () => {
      const error = new ApiError(422, 'Unprocessable entity', 'Validation Failed');
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Unprocessable entity');
      expect(error.error).toBe('Validation Failed');
    });

    it('should be an instance of Error', () => {
      const error = new ApiError(500, 'Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ApiError(400, 'Bad request', 'BadRequest');
      const json = error.toJSON();
      expect(json).toEqual({
        error: 'BadRequest',
        message: 'Bad request',
        statusCode: 400,
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create a 404 error', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
      expect(error.error).toBe('Not Found');
    });

    it('should be an instance of ApiError', () => {
      const error = new NotFoundError('Not found');
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('should serialize to JSON correctly', () => {
      const error = new NotFoundError('User not found');
      const json = error.toJSON();
      expect(json).toEqual({
        error: 'Not Found',
        message: 'User not found',
        statusCode: 404,
      });
    });
  });

  describe('ValidationError', () => {
    it('should create a 400 error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.error).toBe('Validation Error');
    });

    it('should be an instance of ApiError', () => {
      const error = new ValidationError('Invalid');
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ValidationError('Email is required');
      const json = error.toJSON();
      expect(json).toEqual({
        error: 'Validation Error',
        message: 'Email is required',
        statusCode: 400,
      });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create a 401 error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
      expect(error.error).toBe('Unauthorized');
    });

    it('should create a 401 error with custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Token expired');
    });

    it('should be an instance of ApiError', () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('ForbiddenError', () => {
    it('should create a 403 error with default message', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
      expect(error.error).toBe('Forbidden');
    });

    it('should create a 403 error with custom message', () => {
      const error = new ForbiddenError('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Insufficient permissions');
    });

    it('should be an instance of ApiError', () => {
      const error = new ForbiddenError();
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ForbiddenError('Access denied');
      const json = error.toJSON();
      expect(json).toEqual({
        error: 'Forbidden',
        message: 'Access denied',
        statusCode: 403,
      });
    });
  });

  describe('Error inheritance', () => {
    it('all custom errors should extend ApiError', () => {
      expect(new NotFoundError('test').name).toBe('ApiError');
      expect(new ValidationError('test').name).toBe('ApiError');
      expect(new UnauthorizedError('test').name).toBe('ApiError');
      expect(new ForbiddenError('test').name).toBe('ApiError');
    });

    it('all custom errors should have proper stack traces', () => {
      const error = new NotFoundError('test');
      expect(error.stack).toBeDefined();
      // Stack trace contains 'ApiError' since that's the name set in parent class
      expect(error.stack).toContain('ApiError');
    });
  });
});
