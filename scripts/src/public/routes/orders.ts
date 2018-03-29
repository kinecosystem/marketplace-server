import { Request, RequestHandler, Response } from "express";

import {
	cancelOrder as cancelOrderService,
	getOrder as getOrderService,
	getOrderHistory as getOrderHistoryService,
	submitOrder as submitOrderService,
	OrderList,
} from "../services/orders";

/**
 * get an order
 */
export const getOrder = async function(req: Request, res: Response) {
	const order = await getOrderService(req.params.order_id, req.logger);
	res.status(200).send(order);
} as any as RequestHandler;

/**
 * submit an order - this is the earn payload requesting validation
 *
 * check that order hasn't passed expiration + grace period
 * order = OpenOrder.find({orderId})  // throw if doesn't exist
 * assert order.userId == req.userId
 * if !OfferContentService.isValidOffer(order.offerId, req.body.answers):
 *   throw Invalid
 * with GlobalLock(order_id): // or userId, offerId??
 *   order.close()
 *   transaction = Transaction.createFromOrder(order)
 *   transaction.state = pending
 *   transaction.save()
 *   Offer.update({offerId}, used = used - 1)
 *   PaymentService.payTo(User.find(userId).walletAddress, order.amount, memo=order.id)
 * return ok
 */
export const submitOrder = async function(req: Request, res: Response) {
	req.logger.info("submit order", { userId: req.context.user!.id, orderId: req.params.order_id });

	const order = await submitOrderService(
		req.params.order_id,
		req.body.content,
		req.context.user!.walletAddress,
		req.context.user!.appId,
		req.logger);
	res.status(200).send(order);
} as any as RequestHandler;

/**
 * cancel an order
 *
 * order = OpenOrder.find({orderId})
 * assert order.userId == req.userId
 * order.delete()
 */
export const cancelOrder = async function(req: Request, res: Response) {
	await cancelOrderService(req.params.order_id, req.logger);
	res.status(204).send();
} as any as RequestHandler;

/**
 * get user history
 */
export const getOrderHistory = async function(req: Request, res: Response) {
	const orderList: OrderList = await getOrderHistoryService(req.context.user!.id, req.logger);
	res.status(200).send(orderList);
} as any as RequestHandler;

/* // for incoming payments(spend)
 * // in the meanwhile, in a cron job:
 * // listen on Blockchain transactions
 * lastBlock = db.getLastProcessedBlock()
 * transactions, newLastBlock = Blockchain.fromBlock(lastBlock)
 * for tx in transactions:
 *   if tx.recipient in MyAccount.get_all_recipients():
 *     orderId = tx.memo
 *     if Transaction.find(orderId):
 *       continue // already processed this
 *     order = OpenOrder.findOneById(orderId)
 *     transaction = Transaction.createFromOrder(order)
 *     transaction.state = "pending"
 *     transaction.blockchain_data = tx
 *     order.close()
 *     // can be in a different thread:
 *     transaction.asset = AssetService.allocateAssetForUser(userId, order.id, assetType=order.offerId)
 *     transaction.state = "complete"
 *     transaction.save()
 *     // on any failure, write the order_id to a failure queue
 *  db.saveLastBlock(newLastBlock)
 */
