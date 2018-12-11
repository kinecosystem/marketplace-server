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
AppOffer = r('models/applications').AppOffer;


// ***** Terminal Colors and Formats ***** //
TERMINAL_STYLE = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fgblack: "\x1b[30m",
    fgred: "\x1b[31m",
    fggreen: "\x1b[32m",
    fgyellow: "\x1b[33m",
    fgblue: "\x1b[34m",
    fgmagenta: "\x1b[35m",
    fgcyan: "\x1b[36m",
    fgwhite: "\x1b[37m",

    bgblack: "\x1b[40m",
    bgred: "\x1b[41m",
    bggreen: "\x1b[42m",
    bgyellow: "\x1b[43m",
    bgblue: "\x1b[44m",
    bgmagenta: "\x1b[45m",
    bgcyan: "\x1b[46m",
    bgwhite: "\x1b[47m",
};
console.log(TERMINAL_STYLE.bggreen, TERMINAL_STYLE.fgblack,  "To use DB please run one of the server apps, shortcuts available: _ADMIN, _PUBLIC, _INTERNAL ", TERMINAL_STYLE.bgwhite, "eg: _ADMIN() ", TERMINAL_STYLE.reset);
