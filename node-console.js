const BASE_MODULE_PATH = "./scripts/bin/";
const APPS = ["ADMIN", "PUBLIC", "INTERNAL"];

function r(module, reload) {
	if(APPS.includes(module)){
		module = `${module.toLowerCase()}/app`
	}
	if (reload && require.cache[require.resolve(BASE_MODULE_PATH + module)]) {
		delete require.cache[require.resolve(BASE_MODULE_PATH + module)];
	}
	return require(BASE_MODULE_PATH + module);
}

_ADMIN = r.bind(this, "ADMIN");
_PUBLIC = r.bind(this, "PUBLIC");
_INTERNAL = r.bind(this, "INTERNAL");

require("util");

function log(value = "No Value To Log", ...args) {
	if (value.then && typeof value.then === "function") {
		value.then(log);
		args.length && log(...args);
		return;
	}
	if (typeof value === "function") {
		log(value.toString(), ...args);
		return;
	}
	if (args) {
		console.log.apply(console, [value].concat(args));
	} else {
		console.log(util.inspect(value, {showHidden: false, depth: null, color: true}))
	}
}


// init
_offers = r("models/offers");
_orders = r("models/orders");
OfferTranslation = (r("models/translations")).OfferTranslation;
Offer = _offers.Offer;
OfferContent = _offers.OfferContent;
Order = _orders.Order;
OrderContext = _orders.OrderContext;
User = (r("models/users")).User;
AuthToken = (r("models/users")).AuthToken;
Application = (r("models/applications")).Application;
