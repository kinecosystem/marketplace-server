import { User, AuthToken } from "../../scripts/bin/models/users";
import { Asset, Offer } from "../../scripts/bin/models/offers";
import { Poll, PageType } from "../../scripts/bin/public/services/offer_contents";
import { MarketplaceOrder, Order } from "../../scripts/bin/models/orders";
import { createEarn, createSpend } from "../../scripts/bin/create_data/offers";
import { generateId } from "../../scripts/bin/utils";
import { CompletedPayment, paymentComplete } from "../../scripts/bin/internal/services";
import { getDefaultLogger } from "../../scripts/bin/logging";

const animalPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "Whats your favourite animal?",
		description: "Who doesn't love animals!?",
		question: {
			id: "favourite_animal",
			answers: ["dog", "cat", "monkey", "mouse"],
		},
	}],
};

export async function createUser(): Promise<User> {
	const uniqueId = generateId();
	const user = await (User.new({
		appUserId: `test_${uniqueId}`,
		appId: "kik",
		walletAddress: `test_${uniqueId}`
	})).save();

	const authToken = await (AuthToken.new({
		userId: user.id,
		deviceId: `test_${uniqueId}`
	})).save();

	return user;
}

function orderFromOffer(offer: Offer, userId: string): MarketplaceOrder {
	const order = MarketplaceOrder.new({
		userId,
		offerId: offer.id,
		amount: offer.amount,
		type: offer.type,
		status: "pending",
		meta: offer.meta.order_meta,
		blockchainData: {
			transaction_id: "A123123123123123",
			recipient_address: "G123123123123",
			sender_address: "G123123123123"
		}
	});

	return order;
}

export async function createOrders(userId: string) {
	let offers = await Offer.find({ where: { type: "spend" }, take: 3 });
	let order = orderFromOffer(offers[0], userId);
	order.status = "completed";
	const asset: Asset = (await Asset.find({ where: { offerId: order.offerId, ownerId: null }, take: 1 }))[0];
	order.value = asset.asOrderValue(); // {coupon_code: 'xxxxxx', type: 'coupon'}
	await order.save();

	order = orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();

	offers = await Offer.find({ where: { type: "earn" }, take: 3 });
	order = orderFromOffer(offers[0], userId);
	order.status = "completed";
	await order.save();

	order = orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();
}

export async function createOffers() {
	const uniqueId = generateId();

	for (let i = 0; i < 5; i += 1) {
		await createEarn(
			`${uniqueId}_earn${i}`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`earn${i}`, `earn${i}`, `earn${i}`, `earn${i}`, 100, 100, 100, `earn${i}`, `earn${i}`, animalPoll
		);
	}

	for (let i = 0; i < 5; i += 1) {
		await createSpend(
			`${uniqueId}_spend${i}`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, 100, 100, 100, `spend${i}`, `spend${i}`,
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`,
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`,
			[`spend${i}_1`, `spend${i}_2`, `spend${i}_3`, `spend${i}_4`, `spend${i}_5`]
		);
	}
}

export async function completePayment(orderId: string) {
	const order = await Order.getOne(orderId);
	const user = await User.findOneById(order.userId);
	const payment: CompletedPayment = {
		id: order.id,
		app_id: user.appId,
		transaction_id: "fake:" + order.id,
		recipient_address: order.blockchainData.recipient_address,
		sender_address: order.blockchainData.sender_address,
		amount: order.amount,
		timestamp: (new Date()).toISOString()
	};
	await paymentComplete(payment, getDefaultLogger());
}
