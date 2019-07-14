const {performance, PerformanceObserver} = require('perf_hooks');
const offers = require('./offers.json');
const offer_contents = require('./offer_contents.json');

const NUM_ITERATIONS = 1;


async function runSingleConsolePerf(cb, ...args) {
	console.time("runSingleConsolePerf:" + cb.name);
	await cb(...args);
	console.timeEnd("runSingleConsolePerf:" + cb.name);
}

async function runPerfHooksWrapSubFunction(cb, ...args) {
	let sumTime = 0;
	const executor = async () => {
		for (let i = 1; i <= NUM_ITERATIONS; i++) {
			await cb(...args);
		}
	};
	const wrapped = performance.timerify(executor);
	const obs = new PerformanceObserver((list) => {
		list.getEntries().forEach((entry) => {
			if (entry.name === "executor") {
				sumTime = entry.duration;
			}
		});
	});

	obs.observe({entryTypes: ['function']/*, buffered: true*/});
	await wrapped();
	obs.disconnect();
	console.log(`runPerfHooksWrapSubFunction: Average time for ${cb.name}: ${sumTime / NUM_ITERATIONS}`);
}


async function runPerfHooksWrapAndLoop(cb, ...args) {
	let sumTime = 0;
	const wrapped = performance.timerify(cb);
	const obs = new PerformanceObserver((list) => {
		//console.log((list.getEntries()[0].duration))
		list.getEntries().forEach((entry) => {
			if (entry.name === cb.name) {
				sumTime += entry.duration;
			}
		});
	});
	obs.observe({entryTypes: ['function']/*, buffered: true*/});

	for (let i = 1; i <= NUM_ITERATIONS; i++) {
		await wrapped(...args);
	}
	obs.disconnect();
	console.log(`runPerfHooksWrapAndLoop: Average time for ${cb.name} (sum: ${sumTime}): ${sumTime / NUM_ITERATIONS}`);
}

async function runPerfHooksMeasureMark(cb, ...args) {
	let sumTime = 0;
	const measureMarkName = 'start to end';
	const obs = new PerformanceObserver((list) => {
		list.getEntries().forEach((entry) => {
			if (entry.name === measureMarkName) {
				sumTime = entry.duration;
			}
		});
	});
	obs.observe({entryTypes: ['measure']/*, buffered: true*/});
	performance.mark('measure-start');
	for (let i = 1; i <= NUM_ITERATIONS; i++) {
		await cb(...args);
	}
	performance.mark('measure-end');
	performance.measure(measureMarkName, 'measure-start', 'measure-end');
	obs.disconnect();
	console.log(`runPerfHooksMeasureMark: Average time for ${cb.name} (time: ${sumTime}): ${sumTime / NUM_ITERATIONS}`);
}


/* main */
let queue = [];
const addToQueue = async (cb, ...args) => {
	queue = queue.concat([
		async () => console.log(`----${cb.name}----`),
		runSingleConsolePerf.bind(null, cb, ...args),
		runPerfHooksWrapAndLoop.bind(null, cb, ...args),
		runPerfHooksWrapSubFunction.bind(null, cb, ...args),
		runPerfHooksMeasureMark.bind(null, cb, ...args)
	]);
};

const runQueued = async () => {
	for (let i = 0; i < queue.length; i++) {
		await queue[i]();
	}
};


/* Test Funcs */
function putIntoDictFirst(primaryList, secondaryList) {
	const dict = secondaryList.reduce((acc, value) => {
		acc[value.id] = value;
		return acc;
	}, {});
	return primaryList.map(value => Object.assign(value, dict[value.id]));
}

addToQueue(putIntoDictFirst, offers, offer_contents);


function lazlyFind(primaryList, secondaryList) {
	return primaryList.map(value => {
		const elem = secondaryList.find((item, index) => {
			if (item.id === value.id) {
				return Object.assign(value, item)
			}
		})
	});
}

addToQueue(lazlyFind, offers, offer_contents);

function lazlyFindAndRemove(primaryList, secondaryList) {
	return primaryList.map(value => {
		const elem = secondaryList.find((item, index) => {
			if (item.id === value.id) {
				secondaryList.splice(index, 1);
				return Object.assign(value, item)
			}
		})
	});
}

addToQueue(lazlyFindAndRemove, offers, offer_contents);


runQueued();
// async function delay (delay = 200) {
// 	return new Promise(r => setTimeout(r, delay))
// }
//
// runAllPerfs(async function delayTest(){
// 	await delay(100)
// }, offers, offer_contents);
//
//
