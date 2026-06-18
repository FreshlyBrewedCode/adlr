export class AdlrCliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AdlrCliError";
	}
}
