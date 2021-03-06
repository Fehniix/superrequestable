import { RequestableError } from "./model/RequestableErrors";
import { RequestableResult } from "./model/RequestableResult";
import { RequestableFunction } from "./model/RequestableFunction";
import Method from "./model/Method";
import IORedis from "ioredis";
import RequestableGateway from "./RequestableGateway";

import _debug from 'debug';
const debug = _debug('superrequestable');

type References = Map<string, RequestableFunction>;

/**
 * The object responsible for registering and containing `Requestable` methods to run on request.
 */
class SuperRequestable {
	/**
	 * Contains requestable references accessible via `GET` requests.
	 */
	private requestableGETReferences: References;

	/**
	 * Contains requestable references accessible via `POST` requests.
	 */
	private requestablePOSTReferences: References;

	public constructor() {
		this.requestableGETReferences = new Map();
		this.requestablePOSTReferences = new Map();
	}

	/**
	 * Starts the SuperRequestable server.
	 */
	public async start(redis: IORedis.Redis | string): Promise<void> {
		await RequestableGateway.start(redis);
	}

	/**
	 * Stores the provided `_function` in references depending on its `Requestable` method.
	 * Remote requests will trigger the registered function.
	 * @param _function The `Function` marked as `Requestable` to register.
	 * @param method The method by which the function is callable.
	 */
	public register(_function: Function, _functionName: string, method: Method, echoError: boolean = false): void {
		let references: References = this.selectReferences(method);

		if (references === undefined)
			return;

		references.set(_functionName, {
			_function: _function,
			shouldEchoErrors: echoError
		});

		debug(`Registered "${_functionName}" function as ${method}-requestable. Will echo errors = ${echoError}.`);
	}

	/**
	 * Attempts to run the requested function by its name. If not found, returns an error.
	 * @param name The name of the `Requestable` function to run.
	 * @param method The request's method.
	 * @param args The arguments that are applied to the `Requestable` function.
	 */
	public async request(name: string, method: Method, ...args: any[]): Promise<RequestableResult> {
		let references: References = this.selectReferences(method);

		if (references === undefined)
			return { error: RequestableError.INVALID_METHOD };

		let requestableFunction: RequestableFunction | undefined = references.get(name);
		
		if (requestableFunction === undefined)
			return { error: RequestableError.REQUESTABLE_NOT_FOUND }

		const _function = requestableFunction._function;

		let result: any;
		try {
			result = await _function(...args);
		} catch (error) {
			if (!requestableFunction.shouldEchoErrors)
				return { error: RequestableError.DEFAULT_ERROR }

			let _err: string = `Unknown error: ${error}`;

			if (typeof error === 'string')
				_err = error;
			else if (error instanceof Error)
				_err = error.message;

			return { error: _err }
		}

		return { value: result }
	}

	/**
	 * Acts as a references factory: depending on the specified method, it returns the corresponding map of references.
	 */
	private selectReferences(method: Method): References {
		switch (method) {
			case 'GET':
				return this.requestableGETReferences;
			case 'POST':
				return this.requestablePOSTReferences;
		}
	}
}

export default new SuperRequestable();