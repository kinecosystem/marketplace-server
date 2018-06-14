"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var index_1 = require("../index");
function create(user_id, error_reason, offer_id, order_id) {
    return new index_1.Event({
        event_name: "blockchain_sdk_error",
        event_type: "log",
        common: index_1.Event.common(user_id),
        error_reason: error_reason,
        offer_id: offer_id,
        order_id: order_id
    });
}
exports.create = create;
