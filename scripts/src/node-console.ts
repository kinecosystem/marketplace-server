import { Socket } from "net";

export function start(socket?: Socket, intro?: string) {
	const repl = require("repl");
	const util = require("util");

	function log(value?: any, ...args: any[]) {
		let print = console.log;
		if (socket) {
			// If output is not to stdout but a socket write to the socket
			print = (...params: any[]) => {
				socket.write(util.format(...params) + "\n");
			};
		}
		if (value && value.then && typeof value.then === "function") {
			//  if FIRST argument is a promise (thenable object) then print the resolved value
			//  we can iterate over args and handle if any are promises
			value.then((value: any) => log(value, ...args));
			return;
		}
		if (typeof value === "function") {
			log(value.toString(), ...args);
			return;
		}
		if (Array.isArray(value) || typeof value === "object") {
			print(util.inspect(value, { showHidden: false, depth: 4, colors: true }), ...args);
			return;
		}
		print(value, ...args);
	}

	// const babel = require("@babel/core");  //  We can have babel transpile in realtime to get ESNext syntax support (see reference below)

	const BASE_MODULE_PATH = "./";

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
// const colors = { RED: "31", GREEN: "32", YELLOW: "33", BLUE: "34", MAGENTA: "35" };
// const colorize = (color, s) => `\x1b[${color}m${s}\x1b[0m`;
	log("%s%sTo use the DB, initialize one of the server apps, shortcuts available: .admin, .public, .internal%s", TERMINAL_STYLE.bggreen, TERMINAL_STYLE.fgblack, TERMINAL_STYLE.reset);

	/*** Keeping for reference (was a little processing intensive but with a little work can be a nice feature) ***/
	/*const BABEL_OPTIONS = {
		babelrc: false,
		"presets": ["es2015", { "modules": true }]
	};

	const evaluatorFunc = function(cmd, context, filename, callback) {
		babel.transform(cmd, BABEL_OPTIONS, function(err, result) {
			log(result.code);
			eval(result.code);
			callback(null, result.code);
			replServer.displayPrompt(true);
		});
	};*/

// init
	const replServer = repl.start({
		prompt: "marketplace > ",
		useColors: true,
		useGlobal: true,
		terminal: true,
		// ignoreUndefined: true,
		replMode: repl.REPL_MODE_SLOPPY,
		...(socket ? { input: socket, output: socket } : {})
	});

	if (socket) {
		replServer.on("exit", function() {
			log("REPL server exit");
			socket.end();
		});
		socket.on("close", function close() {
			console.log("REPL server socket disconnected."); // we don't have a socket to use log with
			socket.removeListener("close", close);
		});
	}

	const context = replServer.context;
	const r = context.r = function r(module: string, reload?: boolean) {
		if (reload && require.cache[require.resolve(BASE_MODULE_PATH + module)]) {
			delete require.cache[require.resolve(BASE_MODULE_PATH + module)];
		}
		return require(BASE_MODULE_PATH + module);
	};

	context.log = log;
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
	context.utils = r("utils/utils");

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
}

if (require.main === module) {
	start();
}
