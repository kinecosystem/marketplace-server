import { Router } from "express";

import { cancelOrder, submitOrder } from "../services/orders";

export const router: Router = Router();

/**
 * cancel an order
 */
router.delete("/:order_id", async (req, res, next) => {
	const options = {};

	try {
		const result = await cancelOrder(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			error: "Server Error",
			status: 500,
		});
	}
});

/**
 * submit an order
 */
router.post("/:order_id", async (req, res, next) => {
	const options = {};

	try {
		const result = await submitOrder(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			error: "Server Error",
			status: 500,
		});
	}
});


/**
 * get user history
 */
router.get("/", async (req, res, next) => {
	const data = {
		"orders": [
			{
				"result": {"reason": "Transaction failed"},
				"status": "failed",
				"order_id": "Tkjhds8s9d7fsdf6",
				"completion_date": "2018-09-15T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "spend",
				"title": "Spotify",
				"description": "2 week subscription",
				"call_to_action": "tap to reveal coupon",
				"amount": 32000
			},
			{
				"result": {"reason": "Please check again later"},
				"status": "pending",
				"order_id": "Tkjhds8s9d7fsdf5",
				"completion_date": "2018-09-14T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "earn",
				"title": "Dunkin Donuts",
				"description": "completed poll",
				"amount": 4100
			},
			{
				"status": "pending",
				"order_id": "Tkjhds8s9d7fsdf4",
				"completion_date": "2018-09-13T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "spend",
				"title": "Spotify",
				"description": "2 week subscription",
				"call_to_action": "tap to reveal coupon",
				"amount": 6030
			},
			{
				"status": "pending",
				"order_id": "Tkjhds8s9d7fsdf3",
				"completion_date": "2018-09-12T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "earn",
				"title": "Dunkin Donuts",
				"description": "completed poll",
				"amount": 7100
			},
			{
				"result": {"coupon_code": "XXX-YYY-ZZZ"},
				"status": "completed",
				"order_id": "Tkjhds8s9d7fsdf2",
				"completion_date": "2018-09-11T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "spend",
				"title": "Spotify",
				"description": "2 week subscription",
				"call_to_action": "tap to reveal coupon",
				"amount": 3000
			},
			{
				"status": "completed",
				"order_id": "Tkjhds8s9d7fsdf1",
				"completion_date": "2018-09-10T14:33:33",
				"blockchain_data": {
					"transaction_id": "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
					"sender_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
					"recipient_address": "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
				},
				"offer_type": "earn",
				"title": "Dunkin Donuts",
				"description": "completed poll",
				"amount": 4000
			},
		],
		"paging": {
			"cursors": {
				"after": "MTAxNTExOTQ1MjAwNzI5NDE",
				"before": "NDMyNzQyODI3OTQw"
			},
			"previous": "https://graph.facebook.com/me/albums?limit=25&before=NDMyNzQyODI3OTQw",
			"next": "https://graph.facebook.com/me/albums?limit=25&after=MTAxNTExOTQ1MjAwNzI5NDE="
		}
	};
	res.status(200).send(data);
});
