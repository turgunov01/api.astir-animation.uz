import { badRequest } from "./errors.js";

export function requiredString(body, field, options = {}) {
  const value = body?.[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`${field} is required`, "VALIDATION_ERROR");
  }

  const trimmed = value.trim();

  if (options.minLength && trimmed.length < options.minLength) {
    throw badRequest(`${field} must be at least ${options.minLength} characters`, "VALIDATION_ERROR");
  }

  return trimmed;
}

export function optionalString(body, field) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string`, "VALIDATION_ERROR");
  }

  return value.trim();
}

export function email(body, field = "email") {
  const value = requiredString(body, field).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw badRequest(`${field} must be a valid email`, "VALIDATION_ERROR");
  }

  return value;
}

export function pin(body, field = "pin") {
  const value = requiredString(body, field);

  if (!/^\d{4}$/.test(value)) {
    throw badRequest(`${field} must be a 4-digit code`, "VALIDATION_ERROR");
  }

  return value;
}

export function optionalInteger(body, field, options = {}) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (!Number.isInteger(value)) {
    throw badRequest(`${field} must be an integer`, "VALIDATION_ERROR");
  }

  if (options.min !== undefined && value < options.min) {
    throw badRequest(`${field} must be at least ${options.min}`, "VALIDATION_ERROR");
  }

  if (options.max !== undefined && value > options.max) {
    throw badRequest(`${field} must be at most ${options.max}`, "VALIDATION_ERROR");
  }

  return value;
}

export function requiredInteger(body, field, options = {}) {
  const value = optionalInteger(body, field, options);

  if (value === null) {
    throw badRequest(`${field} is required`, "VALIDATION_ERROR");
  }

  return value;
}

export function timeOfDay(body, field) {
  const value = requiredString(body, field);

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw badRequest(`${field} must be HH:mm`, "VALIDATION_ERROR");
  }

  return value;
}

export function allowedDays(body, field = "allowedDays") {
  const value = body?.[field];

  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest(`${field} must be a non-empty array`, "VALIDATION_ERROR");
  }

  const days = [...new Set(value)];

  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw badRequest(`${field} must contain numbers from 1 to 7`, "VALIDATION_ERROR");
  }

  return days.sort((a, b) => a - b);
}
