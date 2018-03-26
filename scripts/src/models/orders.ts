import { Column, Entity } from "typeorm";

import { generateId, IdPrefix } from "../utils";

import { CreationDateModel, register as Register, initializer as Initializer, getRedis } from "./index";
import { BlockchainData, OfferType, OrderValue } from "./offers";
import * as moment from "moment";
import * as redis from "redis";

export type OrderMeta = {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
};
export type OrderStatus = "completed" | "failed" | "pending";
export type OrderError = {
	code: number;
	error: string;
	message?: string;
};

@Entity({ name: "orders" })
@Register
@Initializer("id", () => generateId(IdPrefix.Transaction))
export class Order extends CreationDateModel {
	@Column()
	public type!: OfferType;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData?: BlockchainData;

	@Column({ name: "user_id" })
	public userId!: string;

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public meta!: OrderMeta;

	@Column("simple-json", { nullable: true }) // the asset or JWT payment confirmation
	public value?: OrderValue;

	@Column("simple-json", { nullable: true })
	public error?: OrderError;

	@Column()
	public amount!: number;

	@Column()
	public status!: OrderStatus;

	@Column({ name: "completion_date", nullable: true })
	public completionDate?: Date;
}

const redisClient: redis.RedisClient = getRedis();
import { promisify } from "util";
const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);

export class OpenOrder {
	public static expirationMin = 10; // 10 minutes

	public static async findOneById(orderId: string): Promise<OpenOrder> {
		const data: string = await getAsync(OpenOrder.redisKey(orderId));
		return JSON.parse(data) as OpenOrder;
	}

	private static redisKey(orderId: string) {
		return `OpenOrder:${orderId}`;
	}

	public userId: string;
	public offerId: string;
	public expiration: Date;
	public id: string;

	// XXX maybe add offerType too

	public constructor(offerId: string, userId: string) {
		Object.assign(this, {
			expiration: moment().add(OpenOrder.expirationMin, "minutes").toDate(),
			id: generateId(IdPrefix.Transaction),
			offerId,
			userId
		});
	}

	public async save() {
		await setAsync(OpenOrder.redisKey(this.id), JSON.stringify(this));
	}

	public async delete() {
		await delAsync(OpenOrder.redisKey(this.id));
	}

}
