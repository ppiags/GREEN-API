export class GreenApiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodyText?: string,
  ) {
    super(message)
    this.name = 'GreenApiHttpError'
  }
}

export class GreenApiValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GreenApiValidationError'
  }
}
