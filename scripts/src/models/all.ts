import { Model } from "sequelize";
type GenericModel = Model<any, any>;

const Sequelize = require("sequelize");

import { path } from "../utils";
import { getConfig } from "../config";

const dbConfig = Object.assign(getConfig().db);
if (!dbConfig.options) {
	dbConfig.options = {};
}

if (!dbConfig.options.define) {
	dbConfig.options.define = {
		timestamps: false,
		freezeTableName: true
	};
}

if (dbConfig.options.storage && !/^[./]/.test(dbConfig.options.storage)) {
	dbConfig.options.storage = path(dbConfig.options.storage);
}

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.passive, dbConfig.options);
const models = {
	_items: [] as Model<any, any>[],
	push: function<T extends Model<any, any>>(item: T): T {
		this._items.push(item);
		return item;
	},
	sync: function(): Promise<GenericModel[]> {
		return Promise.all<GenericModel>(this._items.map(item => {
			return item.sync().then(model => {
				console.log(`table ${ model.name } created`);
				return model;
			});
		}));
	}
};

const User = models.push(sequelize.define("users", {
	id: { type: Sequelize.STRING, primaryKey: true }, //internal id
	app_id: Sequelize.STRING,
	app_user_id: Sequelize.STRING,
	created_date: Sequelize.DATE,
	activated_date: Sequelize.DATE
}));

const AuthToken = models.push(sequelize.define("auth_tokens", {
	user_id: Sequelize.STRING, //the internal id
	device_id: Sequelize.STRING,
	created_date: Sequelize.DATE,
	expire_date: Sequelize.DATE, // set to 2 weeks? session period?
	valid: Sequelize.BOOLEAN, // I can invalidate this token manually?
	token: Sequelize.STRING,
}));


const Application = models.push(sequelize.define("applications", {
	id: { type: Sequelize.STRING, primaryKey: true },
	name: Sequelize.STRING,
	jwt_public_key: Sequelize.STRING,
	created_date: Sequelize.DATE, 
}));

const OfferOwner = models.push(sequelize.define("offer_owners", {
	id: { type: Sequelize.STRING, primaryKey: true },
	name: Sequelize.STRING,
}));

const Offer = models.push(sequelize.define("offers", {
	id: { type: Sequelize.STRING, primaryKey: true },
	owner_id: Sequelize.STRING, // OfferOwner
	meta: Sequelize.JSON, // title, description, image
	type: Sequelize.ENUM("spend", "earn"),
	amount: Sequelize.BIGINT,  // amount in micro-kin
	cap: Sequelize.JSON, // complex object with cap rules
	created_date: Sequelize.DATE,
}));

const OfferContent = models.push(sequelize.define("offer_content", {
	offer_id: Sequelize.STRING,
	content: Sequelize.JSON
}));

const AppOffer = models.push(sequelize.define("app_offers", {
	app_id: Sequelize.STRING,
	offer_id: Sequelize.STRING,
}));

// pre-bought coupons
const Asset = models.push(sequelize.define("assets", {
	id: { type: Sequelize.STRING, primaryKey: true },
	type: Sequelize.STRING,
	value: Sequelize.JSON,
	is_used: Sequelize.BOOLEAN,
	created_date: Sequelize.DATE,
}));

const Transaction = models.push(sequelize.define("transactions", {
	order_id: Sequelize.STRING,
	blockchain_txid: Sequelize.STRING,
	user_id: Sequelize.STRING, // redundent
	meta: Sequelize.JSON, // some human readable data for UI
	type: Sequelize.STRING,
	value: Sequelize.JSON,
	created_date: Sequelize.DATE,
}));

models.sync().then(synced => console.log(`finished syncing all models (${ synced.length })`));
