import * as Sequelize from "sequelize";
import { Model } from "sequelize";
import {generateId, IdPrefix} from "../utils";

type GenericModel = Model<any, any>;

import { getConfig } from "../config";
import { path } from "../utils";

const dbConfig = Object.assign(getConfig().db);
if (!dbConfig.options) {
	dbConfig.options = {};
}

if (!dbConfig.options.define) {
	dbConfig.options.define = {
		freezeTableName: true,
		timestamps: false,
	};
}

if (dbConfig.options.storage && !/^[./]/.test(dbConfig.options.storage)) {
	dbConfig.options.storage = path(dbConfig.options.storage);
}

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.passive, dbConfig.options);
const models = {
	_items: [] as GenericModel[],
	push<T extends GenericModel>(item: T): T {
		this._items.push(item);
		return item;
	},
	sync(): Promise<GenericModel[]> {
		return Promise.all<GenericModel>(this._items.map(item => {
			return item.sync().then(model => {
				console.log(`table ${ model.name } created`);
				return model;
			});
		}));
	},
};

export const User = models.push(sequelize.define("users", {
	id: { type: Sequelize.STRING, primaryKey: true, defaultValue: () => generateId(IdPrefix.User) }, //internal id
	app_id: Sequelize.STRING,
	app_user_id: Sequelize.STRING,
	public_address: Sequelize.STRING,  // This might be part of a user_wallet table
	created_date: { type: Sequelize.DATE, defaultValue: Sequelize.NOW},  // default now
	activated_date: Sequelize.DATE,  // default null
}) as GenericModel);

export const AuthToken = models.push(sequelize.define("auth_tokens", {
	user_id: Sequelize.STRING, //the internal id
	device_id: Sequelize.STRING,
	created_date: Sequelize.DATE,
	expire_date: Sequelize.DATE, // set to 2 weeks? session period?
	valid: Sequelize.BOOLEAN, // I can invalidate this token manually?
	token: {type: Sequelize.STRING, defaultValue: () => generateId(IdPrefix.None) },
}) as GenericModel);

const Application = models.push(sequelize.define("applications", {
	id: { type: Sequelize.STRING, primaryKey: true, defaultValue: () => generateId(IdPrefix.App)  },
	jwt_public_key: Sequelize.STRING,
	name: Sequelize.STRING,
}) as GenericModel);

const OfferOwner = models.push(sequelize.define("offer_owners", {
	id: { type: Sequelize.STRING, primaryKey: true },
	name: Sequelize.STRING,
}) as GenericModel);

const Offer = models.push(sequelize.define("offers", {
	id: { type: Sequelize.STRING, primaryKey: true, defaultValue: () => generateId(IdPrefix.Offer)  },
	owner_id: Sequelize.STRING, // OfferOwner
	meta: Sequelize.JSON, // title, description, image, completion: {title, description, call_to_action}
	type: Sequelize.ENUM("spend", "earn"),
	amount: Sequelize.BIGINT,  // amount in micro-kin
	cap: Sequelize.JSON, // complex object with cap rules
	created_date: Sequelize.DATE,
}) as GenericModel);

const OfferContent = models.push(sequelize.define("offer_content", {
	content: Sequelize.JSON,
	offer_id: Sequelize.STRING,
}) as GenericModel);

const AppOffer = models.push(sequelize.define("app_offers", {
	app_id: Sequelize.STRING,
	offer_id: Sequelize.STRING,
}) as GenericModel);

// pre-bought coupons
const Asset = models.push(sequelize.define("assets", {
	created_date: Sequelize.DATE,
	is_used: Sequelize.BOOLEAN,
	id: { type: Sequelize.STRING, primaryKey: true, defaultValue: () => generateId(IdPrefix.None)  },
	type: Sequelize.STRING,
	value: Sequelize.JSON,
}) as GenericModel);

const Transaction = models.push(sequelize.define("transactions", {
	blockchain_txid: Sequelize.STRING,
	created_date: Sequelize.DATE,
	meta: Sequelize.JSON, // title, description, call_to_action, some human readable data for UI
	order_id: {type: Sequelize.STRING, defaultValue: () => generateId(IdPrefix.Transaction) },
	type: Sequelize.STRING,  // earn, spend
	user_id: Sequelize.STRING, // redundant
	value: Sequelize.JSON,  // coupon codes
}) as GenericModel);

// models.sync().then(synced => console.log(`finished syncing all models (${ synced.length })`));
