import * as moment from "moment";
import { DeepPartial } from "typeorm/common/DeepPartial";
import { FindManyOptions } from "typeorm/find-options/FindManyOptions";
import {
	BaseEntity,
	Brackets,
	Column,
	Entity,
	getManager,
	Index,
	JoinColumn,
	ManyToOne,
	ObjectType,
	OneToMany,
	PrimaryColumn,
	SelectQueryBuilder
} from "typeorm";

import { ApiError } from "../errors";
import { generateId, IdPrefix, Mutable, isNothing } from "../utils/utils";

import { User } from "./users";
import { BlockchainData, OfferType, OrderValue } from "./offers";
import { CreationDateModel, initializers as Initializers, register as Register } from "./index";

export interface OrderMeta {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
}

export type OrderOrigin = "marketplace" | "external";
export type OrderStatus = "completed" | "failed" | "pending";
export type OpenOrderStatus = OrderStatus | "opened";
export type OrderStatusAndNegation = OpenOrderStatus | "!opened" | "!completed" | "!failed" | "!pending";

function updateQueryWithFilter(query: SelectQueryBuilder<any>, name: string, value?: string | null, alias?: string) {
	if (!value) {
		return;
	}

	// in case the query is using table alias names, use it with status
	const fieldName = alias ? `${ alias }.${ name }` : name;

	if (value.startsWith("!")) {
		query.andWhere(`${ fieldName } != :${ fieldName }`, { [fieldName]: value.substring(1) });
	} else {
		query.andWhere(`${ fieldName } = :${ fieldName }`, { [fieldName]: value });
	}
}

export type GetOrderFilters = {
	userId?: string;
	orderId?: string;
	offerId?: string;
	nonce?: string;
	origin?: OrderOrigin;
	walletAddress?: string;
	status?: OrderStatusAndNegation;
};

export type OrderFlowType = "p2p" | "earn" | "spend";

export interface Order {
	readonly id: string;
	readonly nonce: string;
	readonly createdDate: Date;
	readonly origin: OrderOrigin;

	blockchainData: BlockchainData;
	contexts: OrderContext[];
	offerId: string;
	amount: number;
	status: OpenOrderStatus;
	currentStatusDate: Date;

	value?: OrderValue;
	expirationDate?: Date;
	error?: ApiError | null;

	forEachContext(fn: (context: OrderContext) => void): void;

	contextForUser(userId: string): OrderContext | null;

	contextForWallet(userId: string): OrderContext | null;

	setStatus(status: OpenOrderStatus): void;

	isExpired(): boolean;

	isExternalOrder(): this is ExternalOrder;

	isMarketplaceOrder(): this is MarketplaceOrder;

	isP2P(): this is P2POrder;

	isSpend(): boolean;

	isEarn(): boolean;

	isNormal(): this is NormalOrder;

	save(): Promise<this>;

	remove(): Promise<this>;

	flowType(): OrderFlowType;
}

function createOrder(data?: DeepPartial<Order>, contexts?: Array<DeepPartial<OrderContext>>): Order {
	const order = OrderImpl.new(data);
	if (contexts) {
		contexts.forEach(context => {
			order.contexts.push(OrderContext.new(context));
		});
	}

	return order;
}

export const Order = {
	DEFAULT_NONCE: "default",
	// count the number of orders completed/pending/opened per offer for a given user or all
	async countAllByOffer(appId: string, options: { userId?: string, offerId?: string } = {}): Promise<Map<string, number>> {
		// XXX add cache
		const statuses = options.userId ? ["pending"] : ["opened", "pending"];

		const query = OrderImpl.createQueryBuilder("ordr") // don't use 'order', it messed things up
			.select("ordr.offer_id")
			.addSelect("COUNT(DISTINCT(ordr.id)) AS cnt")
			.leftJoin("ordr.contexts", "context");

		if (options.userId) {
			query.andWhere("context.user_id = :userId", { userId: options.userId });
		} else {
			query.leftJoin("context.user", "user");
			query.andWhere(`"user".app_id = :appId`, { appId });
		}
		if (options.offerId) {
			query.andWhere("ordr.offer_id = :offerId", { offerId: options.offerId });
		}

		query.andWhere(new Brackets(qb => {
			qb.where("ordr.status = :status", { status: "completed" })
				.orWhere(
					new Brackets(qb2 => {
						qb2.where("ordr.status IN (:statuses)", { statuses })
							.andWhere("ordr.expiration_date > :date", { date: new Date() });
					})
				);
		}))
			.groupBy("ordr.offer_id");

		const results: Array<{ offer_id: string, cnt: number }> = await query.getRawMany();
		const map = new Map<string, number>();
		for (const res of results) {
			map.set(res.offer_id, res.cnt);
		}
		return map;
	},

	countToday(userId: string, type: OfferType, origin: OrderOrigin): Promise<number> {
		const midnight = new Date((new Date()).setUTCHours(0, 0, 0, 0));

		const query = OrderImpl.createQueryBuilder("ordr")
			.leftJoinAndSelect("ordr.contexts", "context")
			.andWhere("context.user_id = :userId", { userId })
			.andWhere("context.type = :type", { type })
			.andWhere("ordr.origin = :origin", { origin })
			.andWhere("ordr.current_status_date > :midnight", { midnight })
			.andWhere(new Brackets(qb => {
				qb.where("ordr.status = :completed", { completed: "completed" })
					.orWhere(
						new Brackets(qb2 => {
							qb2.where("ordr.status = :pending", { pending: "pending" })
								.andWhere("ordr.expiration_date > :expiration_date", { expiration_date: new Date() });
						})
					);
			}));

		return query.getCount();
	},

	async getOpenOrder<T extends Order>(offerId: string, userId: string): Promise<T | undefined> {
		// has at least 2 minutes to complete before expiration
		const latestExpiration = moment().add(2, "minutes").toDate();

		const query = this.genericGet({ offerId, userId });
		query.andWhere("ordr.expiration_date > :date", { date: latestExpiration })
			.orderBy("ordr.expiration_date", "DESC"); // if there are a few, get the one with the most time left

		const order = await (query.getOne() as Promise<T | undefined>);

		if (order && !order.contexts) {
			order.contexts = [];
		}

		return order;
	},

	/**
	 * Returns one order with the id which was passed.
	 * If `status` is passed as well, the order will be returned only if the status matches.
	 *
	 * The status can be any one of the defined statuses or one of their negation, for example:
	 * get open order with id "id1": getOne("id1", "opened")
	 * get NOT open order: getOne("id1", "!opened")
	 */
	getOne<T extends Order>(filters: GetOrderFilters & { orderId: string }): Promise<T | undefined> {
		const query = this.genericGet(filters);
		return query.getOne() as Promise<T | undefined>;

	},

	genericGet<T extends Order>(filters: GetOrderFilters): SelectQueryBuilder<OrderImpl> {
		const query = OrderImpl.createQueryBuilder("ordr")
			.innerJoinAndSelect("ordr.contexts", "context")
			.leftJoinAndSelect("context.user", "user")
			.orderBy("ordr.current_status_date", "DESC")
			.addOrderBy("ordr.id", "DESC");

		updateQueryWithFilter(query, "id", filters.orderId, "ordr");
		updateQueryWithFilter(query, "status", filters.status, "ordr");
		updateQueryWithFilter(query, "nonce", filters.nonce, "ordr");
		updateQueryWithFilter(query, "origin", filters.origin, "ordr");
		updateQueryWithFilter(query, "offer_id", filters.offerId, "ordr");
		updateQueryWithFilter(query, "user_id", filters.userId, "context");
		updateQueryWithFilter(query, "wallet", filters.walletAddress, "context");

		return query;
	},

	/**
	 * Gets orders by `filters` (by `user_id`) object, maps it to order ids and searching  by `IN order_ids`
	 * First `genericGet` will be replaced by caching lookup
	 *
	 * @param      {GetOrderFilters & {userId: string}}  filters
	 * @param      {number}  limit
	 * @return     {Promise<T[]>}  filtered orders including p2p
	 */
	async getAll<T extends Order>(filters: GetOrderFilters & { userId?: string }, limit?: number): Promise<T[]> {
		const allOrders = await this.genericGet(filters).getMany(); // can be replaced by cache

		const ids: string[] = allOrders.map(order => order.id);
		if (!ids.length) {
			return []; // empty array causes sql syntax error
		}

		delete filters.userId;
		const userOrdersQuery = this.genericGet(filters) // this query looks for every orders returned by previous query without userId
			.andWhere(`ordr.id IN (:ids)`, { ids });

		if (limit) {
			userOrdersQuery.limit(limit);
		}

		return userOrdersQuery.getMany() as any;
	},

	find(options?: FindManyOptions<Order>): Promise<Order[]> {
		return OrderImpl.find(options as FindManyOptions<OrderImpl> | undefined);
	},

	queryBuilder(alias?: string): SelectQueryBuilder<Order> {
		return OrderImpl.createQueryBuilder(alias);
	}
};

export type OrderFactory = {
	"new"(): Order;
};

export type MarketplaceOrderFactory = OrderFactory & {
	"new"(data: DeepPartial<Order>, context: DeepPartial<OrderContext>): Order;
};

export type ExternalOrderFactory = OrderFactory & {
	"new"(data: DeepPartial<Order>, context1: DeepPartial<OrderContext>, context2?: DeepPartial<OrderContext>): Order;
};

function extendedOrder(origin: OrderOrigin): (typeof Order) & OrderFactory {
	return Object.assign({}, Order, {
		"new"(data?: DeepPartial<Order>, ...context: Array<DeepPartial<OrderContext>>): Order {
			data = Object.assign(
				data,
				{ origin });

			if (isNothing(data.nonce)) {
				(data as Mutable<Order>).nonce = Order.DEFAULT_NONCE;
			}

			return createOrder(data, context!);
		},

		getOne<T extends Order>(filters: GetOrderFilters & { orderId: string }): Promise<T | undefined> {
			return Order.getOne({ ...filters, origin });
		},

		getAll<T extends Order>(filters: GetOrderFilters & { userId: string }, limit?: number): Promise<T[]> {
			return Order.getAll({ ...filters, origin }, limit);
		}
	});
}

export type MarketplaceOrder = NormalOrder;

export const MarketplaceOrder = extendedOrder("marketplace") as (typeof Order) & MarketplaceOrderFactory;

export type ExternalOrder = Order;

export const ExternalOrder = extendedOrder("external") as (typeof Order) & ExternalOrderFactory;
export const P2POrder = extendedOrder("external") as (typeof Order) & ExternalOrderFactory;

export type NormalOrder = Order & {
	user: User;
	meta: OrderMeta;
	contexts: [OrderContext];
	readonly type: OfferType;
};

export type P2POrder = Order & {
	sender: User;
	recipient: User;
	senderMeta: OrderMeta;
	recipientMeta: OrderMeta;
	contexts: [OrderContext, OrderContext];
};

@Entity({ name: "orders" })
@Initializers({
	contexts: () => [],
	id: () => generateId(IdPrefix.Transaction),
	currentStatusDate: () => moment().toDate(),
	expirationDate: () => moment().add(10, "minutes").toDate() // opened expiration
})
@Index(["offerId", "nonce"])
@Index(["offerId", "status"])
@Register
class OrderImpl extends CreationDateModel implements Order {
	@Column()
	public readonly origin!: OrderOrigin;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData!: BlockchainData;

	@OneToMany(type => OrderContext, context => context.order, {
		cascadeInsert: true,
		cascadeUpdate: true
	})
	public contexts!: OrderContext[];

	@Index()
	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column()
	public nonce!: string;

	@Column("simple-json", { nullable: true })
	public error?: ApiError | null;

	@Column()
	public amount!: number;

	@Column()
	public status!: OpenOrderStatus;

	@Column({ name: "current_status_date" })
	public currentStatusDate!: Date;

	@Column("simple-json", { nullable: true })
	public value?: OrderValue;

	@Column({ name: "expiration_date", nullable: true })
	public expirationDate?: Date;

	public async save(): Promise<this> {
		await getManager().transaction(async mgr => {
			for (const context of this.contexts) {
				(context as Mutable<OrderContext>).order = this;
				(context as Mutable<OrderContext>).orderId = this.id;
				(context as Mutable<OrderContext>).userId = context.user.id;
			}

			await mgr.save(this);
		});

		return this;
	}

	public setStatus(status: OpenOrderStatus) {
		this.status = status;
		this.currentStatusDate = new Date();
		switch (this.status) {
			case "pending":
				this.expirationDate = moment(this.currentStatusDate).add(45, "seconds").toDate();
				break;
			case "opened":
				this.expirationDate = moment(this.currentStatusDate).add(10, "minutes").toDate();
				break;
			default:
				this.expirationDate = null as any;
		}
	}

	public isExpired(): boolean {
		if (this.expirationDate) {
			return this.expirationDate < new Date();
		}
		return false;
	}

	public isExternalOrder(): boolean {
		return this.origin === "external";
	}

	public isMarketplaceOrder(): boolean {
		return this.origin === "marketplace";
	}

	public isP2P(): this is P2POrder {
		return this.contexts.length === 2;
	}

	public isSpend(): boolean {
		return this.contexts.length === 1 && this.contexts[0].type === "spend";
	}

	public isEarn(): boolean {
		return this.contexts.length === 1 && this.contexts[0].type === "earn";
	}

	public isNormal(): this is NormalOrder {  // XXX i'd remove this concept completely
		return !this.isP2P();
	}

	public contextForUser(userId: string): OrderContext | null {
		for (const context of this.contexts) {
			if (context.user.id === userId) {
				return context;
			}
		}

		return null;
	}

	public contextForWallet(walletAddress: string): OrderContext | null {
		for (const context of this.contexts) {
			if (context.wallet === walletAddress) {
				return context;
			}
		}

		return null;
	}

	public forEachContext(fn: (context: OrderContext) => void) {
		this.contexts.forEach(fn);
	}

	public get sender(): User | null {
		for (const context of this.contexts) {
			if (context.type === "spend") {
				return context.user;
			}
		}

		return null;
	}

	public get senderMeta(): OrderMeta | null {
		for (const context of this.contexts) {
			if (context.type === "spend") {
				return context.meta;
			}
		}

		return null;
	}

	public get recipient(): User | null {
		for (const context of this.contexts) {
			if (context.type === "earn") {
				return context.user;
			}
		}

		return null;
	}

	public get recipientMeta(): OrderMeta | null {
		for (const context of this.contexts) {
			if (context.type === "earn") {
				return context.meta;
			}
		}

		return null;
	}

	public get user(): User | null {
		if (this.isP2P()) {
			throw new Error("Order.user isn't supported when origin is 'p2p'");
		}

		return this.contexts[0].user;
	}

	public get meta(): OrderMeta | null {
		if (this.isP2P()) {
			throw new Error("Order.meta isn't supported when origin is 'p2p'");
		}

		return this.contexts[0].meta;
	}

	public get type(): OfferType {
		if (this.isP2P()) {
			throw new Error("Order.type isn't supported when origin is 'p2p'");
		}

		return this.contexts[0].type;
	}

	public remove() {
		return getManager().transaction(async manager => {
			await manager.query("DELETE FROM orders_contexts WHERE order_id=$1", [this.id]);
			return manager.remove(this);
		});
	}

	public flowType(): OrderFlowType {
		if (this.isP2P()) {
			return "p2p";
		} else if (this.isEarn()) {
			return "earn";
		} else if (this.isSpend()) {
			return "spend";
		}
		throw new Error(`unexpected flow type for ${ this }`);
	}
}

@Entity({ name: "orders_contexts" })
@Register
export class OrderContext extends BaseEntity {
	public static new(this: ObjectType<OrderContext>, data?: DeepPartial<OrderContext>): OrderContext {
		return (this as typeof BaseEntity).create(data!) as OrderContext;
	}

	@ManyToOne(type => OrderImpl, order => order.contexts)
	@JoinColumn({ name: "order_id" })
	public readonly order!: Order;

	@ManyToOne(type => User, user => user.contexts)
	@JoinColumn({ name: "user_id" })
	public readonly user!: User;

	@Column()
	public type!: OfferType;

	// ECO-553: added field
	@Column()
	public wallet!: string;

	@Column("simple-json")
	public readonly meta!: OrderMeta;

	@PrimaryColumn({ name: "order_id" })
	public readonly orderId!: string;

	@PrimaryColumn({ name: "user_id" })
	public readonly userId!: string;
}
