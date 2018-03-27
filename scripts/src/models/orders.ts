import { Column, Entity } from "typeorm";
import * as moment from "moment";
import { generateId, IdPrefix } from "../utils";
import { CreationDateModel, register as Register, initializer as Initializer, getRedis } from "./index";
import { BlockchainData, OfferType, OrderValue } from "./offers";

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

const redisClient = getRedis();


export class OpenOrder {
	public static expirationMin = 10; // 10 minutes

	public static async findOneById(orderId: string): Promise<OpenOrder | undefined> {
		const data: string = await redisClient.async.get(OpenOrder.redisKey(orderId));
		if (!data) {
			return undefined;
		}
		const parsed = JSON.parse(data) as OpenOrder;
		parsed.expiration = moment(parsed.expiration).toDate(); // JSON.parse doesn't parse dates
		return Object.assign(new OpenOrder(parsed.offerId, parsed.userId), parsed);
	}

	private static redisKey(orderId: string) {
		return `OpenOrder:${orderId}`;
	}

	public userId!: string;
	public offerId!: string;
	public expiration!: Date;
	public id!: string;

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
		await redisClient.async.set(OpenOrder.redisKey(this.id), JSON.stringify(this));
	}

	public async delete() {
		await redisClient.async.del(OpenOrder.redisKey(this.id));
	}

}
