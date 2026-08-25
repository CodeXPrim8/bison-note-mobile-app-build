import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

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
  return NextResponse.json(
    { status: false, message, code, data },
    { status: httpStatus },
  )
}

export function successResponse<T>(data: T, message = 'OK', httpStatus = 200): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ status: true, message, data }, { status: httpStatus })
}

export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return errorResponse(error.httpStatus, error.code, error.message, error.data)
  }
  if (error instanceof ZodError) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid request', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  console.error(error)
  return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong')
}
