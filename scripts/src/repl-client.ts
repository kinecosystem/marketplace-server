#!/usr/bin/env node
import * as net from "net";
import * as path from "path";

const args = process.argv.slice(2);
if (args.length < 1 || !(args[0] as string).match(/^[\w\d.]{3,}:\d{1,5}$/)) {
	console.log(`USAGE: ${ path.basename(process.argv[1]) } <HOST:PORT>`);
	process.exit(1);
}

const [host, port] = args[0].split(":");

const socket = net.connect(Number(port), host);

process.stdin.pipe(socket);
socket.pipe(process.stdout);

socket.on("connect", () => {
	process.stdin.setRawMode!(true);
});

socket.on("close", () => {
	console.log("\nSocket closed");
	process.exit(0);
});

process.on("exit", () => {
	console.log("Exiting...");
	socket.end();
});
