const repl = require("repl");
// const babel = require("@babel/core");

const BASE_MODULE_PATH = "./scripts/bin/";

const util = require("util");

// ***** Terminal Colors and Formats ***** //
const TERMINAL_STYLE = {
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

console.log(TERMINAL_STYLE.bggreen, TERMINAL_STYLE.fgblack, "To use DB init one of the server apps, shortcuts available: .admin, .public, .internal", TERMINAL_STYLE.reset);

/*** Keeping for reference ***/
/*const BABEL_OPTIONS = {
	babelrc: false,
	"presets": ["es2015", { "modules": true }]
};

const evaluatorFunc = function(cmd, context, filename, callback) {
	babel.transform(cmd, BABEL_OPTIONS, function(err, result) {
		console.log(result.code);
		eval(result.code);
		callback(null, result.code);
		replServer.displayPrompt(true);
	});
};*/

const replServer = repl.start({
	prompt: "marketplace > ",
	useColors: true,
	// ignoreUndefined: true,
	replMode: repl.REPL_MODE_SLOPPY,
});

// init
const context = replServer.context;
const r = context.r = function r(module: string, reload?: boolean) {
	if (reload && require.cache[require.resolve(BASE_MODULE_PATH + module)]) {
		delete require.cache[require.resolve(BASE_MODULE_PATH + module)];
	}
	return require(BASE_MODULE_PATH + module);
};

context.log = function log(value: any = "No Value To Log", ...args) {
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
		console.log(util.inspect(value, { showHidden: false, depth: null, color: true }));
	}
};

/*  Require app models  */
context._offers = r("models/offers");
context.Offer = context._offers.Offer;
context.OfferContent = context._offers.OfferContent;
context.OfferTranslation = (r("models/translations")).OfferTranslation;
context._orders = r("models/orders");
context.Order = context._orders.Order;
context.OrderContext = context._orders.OrderContext;
context.User = (r("models/users")).User;
context.AuthToken = (r("models/users")).AuthToken;
context.Application = (r("models/applications")).Application;
context.AppOffer = r("models/applications").AppOffer;

/* Add shortcut REPL commands for loading the marketplace apps */
replServer.defineCommand("admin", {
	help: "Init the Admin App",
	action: r.bind(null, "admin/app")
});
replServer.defineCommand("public", {
	help: "Init the Public App",
	action: r.bind(null, "public/app")
});
replServer.defineCommand("internal", {
	help: "Init the Internal App",
	action: r.bind(null, "internal/app")
});
