const Sequelize = require("sequelize");
const sequelize = new Sequelize("database", "username", "password", {
	host: "localhost",
	dialect: "sqlite",

	pool: {
	max: 5,
	min: 0,
	acquire: 30000,
	idle: 10000
	},

	// SQLite only
	storage: "path/to/database.sqlite",

	// http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
	operatorsAliases: false
});

const User = sequelize.define("users", {
	id: Sequelize.STRING,
	app_id: Sequelize.STRING,
	device_id: Sequelize.STRING,
	created_date: Sequelize.DATE, 
});

const Application = sequelize.define("applications", {
	id: Sequelize.STRING,
	name: Sequelize.STRING,
	jwt_public_key: Sequelize.STRING,
	wallet_address: Sequelize.STRING, // kre goes here
	created_date: Sequelize.DATE, 
});

const OfferOwner = sequelize.define("offer_owners", {
	id: Sequelize.STRING,
	name: Sequelize.STRING,
})

const Offer = sequelize.define("offers", {
	id: Sequelize.STRING,
	owner_id: Sequelize.STRING, // OfferOwner
	meta: Sequelize.JSON, // title, description, image
	type: Sequelize.ENUM("spend", "earn"),
	amount: Sequelize.INTEGER,  // amount in kin? min-kin, micro-kin? teds?
	content: Sequelize.JSON, // in case of poll, the poll questions and answers. in case of coupon - empty?
	cap: Sequelize.JSON, // complex object with cap rules
	created_date: Sequelize.DATE,
});

const AppOffer = sequelize.define("app_offers", {
	app_id: Sequelize.STRING,
	offer_id: Sequelize.STRING,
});

const ApiToken = sequelize.define("api_tokens", {
	user_id: Sequelize.STRING,
	app_id: Sequelize.STRING,  // redundent
	created_date: Sequelize.DATE,
	expire_date: Sequelize.DATE, // set to 2 weeks? session period?
	valid: Sequelize.BOOLEAN, // I can invalidate this token manually?
	did_tos: Sequelize.BOOLEAN,
	token: Sequelize.STRING,
});

// pre-bought coupons
const Asset = sequelize.define("assets", {
	id: Sequelize.STRING,
	type: Sequelize.STRING,
	value: Sequelize.JSON,
	is_used: Sequelize.BOOLEAN,
	created_date: Sequelize.DATE,
});

const TransactionHistoryItem = sequelize.define("transaction_history_item", {
	order_id: Sequelize.STRING,
	blockchain_txid: Sequelize.STRING,
	user_id: Sequelize.STRING, // redundent
	meta: Sequelize.JSON, // some human readable data for UI
	type: Sequelize.STRING,
	value: Sequelize.JSON,
	created_date: Sequelize.DATE,
});
