import { Column, Entity } from "typeorm";

import { CreationDateModel, register as Register } from "./index";
import { IdPrefix } from "../utils";
import { BlockchainData, AssetValue, OfferType, Offer } from "./offers";

export type OrderMeta = {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
};

export type FailureReason = {
	failure_message: string;
};

export type OrderStatus = "completed" | "failed" | "pending";

@Entity({ name: "orders" })
@Register
export class Order extends CreationDateModel {
	@Column()
	public type: OfferType;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData: BlockchainData;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "offer_id" })
	public offerId: string;

	@Column("simple-json")
	public meta: OrderMeta;

	@Column("simple-json", { nullable: true }) // the asset or JWT payment confirmation
	public value: AssetValue | FailureReason;

	@Column()
	public amount: number;

	@Column()
	public status: OrderStatus;

	@Column({ name: "completion_date", nullable: true })
	public completionDate: Date;

	/**
	 * create an order in pending state from an open order and offer
	 */
	public constructor() // XXX nitzan - I don't want a default constructor, but Register requires this
	public constructor(openOrder: OpenOrder, offer: Offer)
	public constructor(openOrder?: OpenOrder, offer?: Offer) {
		super(IdPrefix.Transaction);
		if (!openOrder || !offer) {
			return; // XXX see ECO-110
		}
		Object.assign(this, {
			id: openOrder.id,
			userId: openOrder.userId,
			offerId: openOrder.offerId,
			amount: offer.amount,
			type: offer.type,
			status: "pending",
			meta: offer.meta.order_meta,
		});
	}
}

export type OpenOrder = {
	userId: string;
	offerId: string;
	expiration: Date;
	id: string;
	// XXX maybe add offerType too
};
