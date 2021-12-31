/**
 * Represents the result of a request.
 */
export interface RequestableResult<T = any> {
	/**
	 * The return-value of the requestable function.
	 */
	value?: T,

	/**
	 * The error generated by the requestable function's execution.
	 */
	error?: string
}