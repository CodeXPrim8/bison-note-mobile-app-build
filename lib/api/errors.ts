import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { MissingEnvError } from '@/lib/env'

export interface ApiErrorBody {
  status: false
  message: string
  code: string
  data?: Record<string, unknown>
}

export interface ApiSuccessBody<T> {
  status: true
  message: string
  data: T
}

export class ApiError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly data?: Record<string, unknown>

  constructor(httpStatus: number, code: string, message: string, data?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
    this.data = data
  }
}

export function errorResponse(
  httpStatus: number,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ status: false, message, code, data }, { status: httpStatus })
}

export function successResponse<T>(data: T, message = 'OK', httpStatus = 200): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ status: true, message, data }, { status: httpStatus })
}

export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return errorResponse(error.httpStatus, error.code, error.message, error.data)
  }
  if (error instanceof ZodError) {
    return errorResponse(400, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid request', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  if (error instanceof MissingEnvError) {
    console.error(error.message)
    return errorResponse(503, 'AUTH_UNAVAILABLE', 'Could not start Paystack checkout.')
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    const message = (error as { message: string }).message
    const code = (error as { code?: string }).code
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
      return errorResponse(
        503,
        'ADMIN_SQL_REQUIRED',
        'Run supabase/migrations/0018_super_admin_writes.sql in the ɃU SQL editor so Super Admin can save settings.',
      )
    }
  }
  console.error(error)
  return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong')
}
