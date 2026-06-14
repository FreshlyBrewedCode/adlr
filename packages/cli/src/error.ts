export class AdlerCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdlerCliError"
  }
}
