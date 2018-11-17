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
import { generateId, IdPrefix } from "../utils";

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

function updateQueryWithStatus(query: SelectQueryBuilder<any>, status?: OrderStatusAndNegation | null, alias?: string) {
	if (!status) {
		return;
	}

	// in case the query is using table alias names, use it with status
	const fieldName = alias ? `${ alias }.status` : "status";

	if (status.startsWith("!")) {
		query.andWhere(`${ fieldName } != :status`, { status: status.substring(1) });
	} else {
		query.andWhere(`${ fieldName } = :status`, { status });
	}
}

function updateQueryWithFilter(query: SelectQueryBuilder<any>, name: string, value?: string | null, alias?: string) {
	if (!value) {
		return;
	}

	// in case the query is using table alias names, use it with status
	const fieldName = alias ? `${ alias }.${ name }` : name;

	if (value.startsWith("!")) {
		query.andWhere(`${ fieldName } != :value`, { value: value.substring(1) });
	} else {
		query.andWhere(`${ fieldName } = :value`, { value });
	}
}

export type GetOrderFilters = {
	userId: string;
	offerId?: string;
	origin?: OrderOrigin;
	status?: OrderStatusAndNegation;
};

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

	contextFor(userId: string): OrderContext | null;

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

export type FindByParams = {
	offerId: string;
	userId: string;
	nonce?: string;
};

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

		const query = OrderImpl.createQueryBuilder("ordr") // don't use 'order', it messed things up
			.leftJoinAndSelect("ordr.contexts", "context")
			.leftJoinAndSelect("context.user", "user")
			.where("ordr.offer_id = :offerId", { offerId })
			.andWhere("ordr.status = :status", { status: "opened" })
			.andWhere("context.user_id = :userId", { userId })
			.andWhere("ordr.expiration_date > :date", { date: latestExpiration })
			.orderBy("ordr.expiration_date", "DESC"); // if there are a few, get the one with the most time left

		const order = await (query.getOne() as Promise<T | undefined>);

		if (order && !order.contexts) {
			order.contexts = [];
		}

		return order;
	},

	/**
	 * Returns one order which matches the passed user and offer id
	 *
	 * @param orderId
	 * @param userId
	 */
	findBy<T extends Order>(params: FindByParams & { origin?: OrderOrigin; }): Promise<T | undefined> {
		const query = OrderImpl.createQueryBuilder("ordr")
			.innerJoinAndSelect("ordr.contexts", "context")
			.leftJoinAndSelect("context.user", "user")
			.where("ordr.offer_id = :offerId", { offerId: params.offerId })
			.andWhere("context.user_id = :userId", { userId: params.userId });

		if (params.nonce) {
			query.andWhere("ordr.nonce = :nonce", { nonce: params.nonce });
		}

		if (params.origin) {
			query.andWhere("ordr.origin = :origin", { origin: params.origin });
		}

		query.orderBy("ordr.current_status_date", "DESC");

		return query.getOne() as Promise<T | undefined>;
	},

	/**
	 * Returns one order with the id which was passed.
	 * If `status` is passed as well, the order will be returned only if the status matches.
	 *
	 * The status can be any one of the defined statuses or one of their negation, for example:
	 * get open order with id "id1": getOne("id1", "opened")
	 * get NOT open order: getOne("id1", "!opened")
	 */
	getOne<T extends Order>(orderId: string, status?: OrderStatusAndNegation, origin?: OrderOrigin): Promise<T | undefined> {
		const query = OrderImpl.createQueryBuilder("ordr")
			.innerJoinAndSelect("ordr.contexts", "context")
			.leftJoinAndSelect("context.user", "user")
			.where("ordr.id = :orderId", { orderId });

		updateQueryWithStatus(query, status, "ordr");

		if (origin) {
			query.andWhere("ordr.origin = :origin", { origin });
		}

		return query.getOne() as Promise<T | undefined>;
	},

	getAll<T extends Order>(filters: GetOrderFilters, limit?: number, origin?: OrderOrigin): Promise<T[]> {
		const query = OrderImpl.createQueryBuilder("ordr") // don't use 'order', it messed things up
			.leftJoinAndSelect("ordr.contexts", "context")
			.leftJoinAndSelect("context.user", "user")
			.where("context.user_id = :userId", filters)
			.orderBy("ordr.current_status_date", "DESC")
			.addOrderBy("ordr.id", "DESC");

		// updateQueryWithStatus(query, filters.status);
		updateQueryWithFilter(query, "status", filters.status, "ordr");
		updateQueryWithFilter(query, "origin", filters.origin, "ordr");
		updateQueryWithFilter(query, "offer_id", filters.offerId, "ordr");

		/**
		 * In case `filters` doesn't contain the `origin`, include the origin of the extending class.
		 * So, when doing:
		 *  MarketplaceOrder.getAll({ userId: "..."})
		 * It will add `origin: "marketplace"` to the filters.
		 *
		 * When doing:
		 *  ExternalOrder.getAll({ userId: "..."})
		 * It will add `origin: "external"` to the filters.
		 *
		 * When doing:
		 *  Order.getAll({ userId: "..."})
		 * No origin is added
		 */
		if (!filters.origin && origin) {
			query.andWhere("ordr.origin = :origin", { origin });
		}

		if (limit) {
			query.limit(limit);
		}

		return query.getMany() as any;
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
				{ nonce: Order.DEFAULT_NONCE },
				data,
				{ origin });
			return createOrder(data, context!);
		},

		findBy<T extends Order>(params: FindByParams): Promise<T | undefined> {
			return Order.findBy(Object.assign({}, params, { origin }));
		},

		getOne<T extends Order>(orderId: string, status?: OrderStatusAndNegation): Promise<T | undefined> {
			return Order.getOne(orderId, status, origin);
		},

		getAll<T extends Order>(filters: GetOrderFilters, limit?: number): Promise<T[]> {
			return Order.getAll(filters, limit, origin);
		}
	});
}

export type MarketplaceOrder = NormalOrder;

export const MarketplaceOrder = extendedOrder("marketplace") as (typeof Order) & MarketplaceOrderFactory;

export type ExternalOrder = Order;

export const ExternalOrder = extendedOrder("external") as (typeof Order) & ExternalOrderFactory;

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
				(context as any).order = this;
				(context as any).orderId = this.id;
				(context as any).user_id = context.user.id;
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

	public contextFor(userId: string): OrderContext | null {
		for (const context of this.contexts) {
			if (context.user.id === userId) {
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

	@Column("simple-json")
	public readonly meta!: OrderMeta;

	@PrimaryColumn({ name: "order_id" })
	public readonly orderId!: string;

	@PrimaryColumn({ name: "user_id" })
	public readonly userId!: string;
}
