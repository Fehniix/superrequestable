import { Queue, Worker, QueueEvents, Job } from "bullmq";
import { randomUUID } from "crypto";
import { RequestableResult } from "./model/RequestableResult";
import { RequestJob, ResponseJob } from "./RequestableGateway";
import Method from "./model/Method";
import IORedis from "ioredis";
import Redis from "./Redis";

import _debug from 'debug';
const debug = _debug('superrequestable:client');

/**
 * A client that allows an endpoint to call remote `Requestable` functions.
 */
class RequestableClient {
	/**
	 * The BullMQ Worker responsible for receiving requestable responses.
	 */
	private bmqWorker!: Worker<ResponseJob>;

	/**
	 * The BullMQ Queue responsible for sending requestable requests.
	 */
	private bmqQueue!: Queue<RequestJob>;

	/**
	 * The BullMQ Events object responsible for determining when a response was received.
	 */
	private bmqQueueEvents!: QueueEvents;

	/**
	 * The IORedis connection used by the underlying BullMQ queue and worker.
	 */
	private redisConnection!: IORedis.Redis;

	/**
	 * Starts the client.
	 */
	public async start(redis: string | IORedis.Redis) {
		this.redisConnection = Redis.createConnection(redis);

		this.bmqQueue = new Queue('superrequestable:request', {
			connection: this.redisConnection.duplicate()
		});

		this.bmqWorker = new Worker('superrequestable:response', (() => {}) as any, {
			connection: this.redisConnection.duplicate()
		});

		this.bmqQueueEvents = new QueueEvents('superrequestable:response', {
			connection: this.redisConnection.duplicate()
		});
	}

	/**
	 * Sends a `GET` request.
	 * @param functionName The remote requestable function name. **Case-sensitive**.
	 * @param args The arguments that will be passed to the requestable function.
	 */
	public async get<T>(functionName: string, ...args: any[]): Promise<T> {
		return this.request<T>(functionName, 'GET', args);
	}

	/**
	 * Sends a `POST` request.
	 * @param functionName The remote requestable function name. **Case-sensitive**.
	 * @param args The arguments that will be passed to the requestable function.
	 */
	public async post<T>(functionName: string, ...args: any[]): Promise<T> {
		return this.request<T>(functionName, 'POST', args);
	}

	private async request<T>(functionName: string, method: Method, args: any[]): Promise<T> {
		//	This Promise resolves when the queued job gets processed by the SRequestable server, 
		//	and its output processed by the client.
		return new Promise((resolve, reject) => {
			if (this.bmqQueue === undefined || this.bmqWorker === undefined || this.bmqQueueEvents === undefined)
				reject('The RequestableClient must be started first by calling `RequestableClient.start()`.');

			const requestResponseUUID: string = randomUUID();

			const callback = async (args: {
				jobId: string;
				returnvalue: string;
				prev?: string | undefined;
			}, _: string) => {
				const completedJob: Job<ResponseJob> | undefined = await Job.fromId(this.bmqWorker, args.jobId);

				if (completedJob === undefined) {
					debug(`Job #${args.jobId} is undefined.`);
					return;
				}

				if (completedJob.data.id !== requestResponseUUID)
					return;

				const result: RequestableResult = completedJob.data.result;

				this.bmqQueueEvents.off('completed', callback);

				if (result.error !== undefined) {
					debug(`Job@${method}#${requestResponseUUID} failed with error: ${result.error}`);
					reject(result.error);
					return;
				}

				debug(`Job@${method}#${requestResponseUUID} completed successfully, received response from server: %o`, result.value);

				resolve(result.value);
			}

			this.bmqQueueEvents.on('completed', callback);

			debug(`Added Job@${method}#${requestResponseUUID} to the superrequestable:request queue.`);

			this.bmqQueue.add('superrequestable:request', {
				id: requestResponseUUID,
				functionName: functionName,
				method: method,
				args: args
			});
		});
	}
}

export default new RequestableClient();