import { Request, Response, Router, Express, RequestHandler } from "express";
import { getDefaultLogger as logger } from "../logging";

import {
	getApplications, getApplication, getOffers,
	getOffer, getPollResults,
	getUserData, getApplicationUserData, getOrder,
	getApplicationUsers, getOfferStats,
	getOrders, fuzzySearch, getWallet, getWalletPayments,
	getApplicationOffers, getUserOffers,
	retryOrder, retryUserWallet, getApplicationStats,
	changeAppOffer, changeOffer
} from "./services";

import { statusHandler } from "../middleware";
import { getConfig } from "./config";

function jsonResponse(func: (body: any, params: any, query: any) => Promise<string>): RequestHandler {
	return async function(req: Request, res: Response) {
		const content = await func(req.body, req.params, req.query);
		res.status(200).json(content);
	} as any as RequestHandler;
}

function wrapService(func: (params: any, query: any) => Promise<string>): RequestHandler {
	return async function(req: Request, res: Response) {
		const content = await func(req.params, req.query);
		/* tslint:disable:no-trailing-whitespace */
		const html = `
<html>
	<head>
		<title>Marketplace Admin</title>
		<style>
		body {
			font-family: Arial;
			background: #ffffff;
		}
		td {
			vertical-align: bottom;
		}
		tr:nth-child(even) {background: #FFFFFF}
		tr:nth-child(odd) {background: #FFEEEE}
		img {
			height: 50px;
		}
		pre {
			font-family: "Courier New";
			background: #eeeeee;
			padding: 5px;
			width: 250px;
			overflow: scroll;
		}
		.alert {
			color: red;
		}
		.wide {
			width: 1250px;
		}
		.status_completed a {
			color: green;
			font-weight: bold;
		}
		.status_failed a {
			color: red;
			font-weight: bold;
		}
		.status_pending a {
			color: yellow;
			font-weight: bold;
		}
		.status_opened a {
			color: purple;
			font-weight: bold;
		}
		input {
			width: 70px;
		}
		#footer {
			height: 70px;
			width: 100%;
		}
		</style>
		<style>
		.flex-row-container {
		    display: flex;
		    flex-direction: row;
		    flex-wrap: nowrap;
		    justify-content: center;
		    align-content: stretch;
		    align-items: center;
	    }


		#toast {
		    visibility: hidden;
		    min-width: 250px;
		    margin-left: -125px;
		    background-color: #0a2;
		    font-weight: bold;
		    color: #fff;
		    text-align: center;
		    border-radius: 2px;
		    padding: 16px;
		    position: fixed;
		    z-index: 100000;
		    left: 50%;
		    bottom: 30px;
		    font-size: 17px;
		}
		
		.btn {
			width: 52%;
			height: 8.5%;
			margin: 5px;
			cursor: pointer;
			border-radius: 9px;
		}
		
		.overlay {
            position: fixed;
			display: none;
			width: 100%;
			height: 100%;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: rgba(0,0,0,0.5);
			z-index: 2;
			cursor: pointer;
		}
		.overlay-content {
			position: absolute;
			width: 80%;
			height: 80%;
			top: 50%;
			left: 50%;
			padding: 2%;
			color: black;
			background-color: white;
			transform: translate(-50%,-50%);
			-ms-transform: translate(-50%,-50%);
		}
		
		.overlay-content div {
			margin: 5px;
		}
		
		.overlay-content .text{
			flex: 4 1 auto;
			overflow-y: scroll;
			font-size: 15px;
			max-height: 99%;
			padding-right: 5px;
		}
		.overlay-content .controls {
			flex: 1 1 auto;
			text-align: center;
		}
		.overlay-content .preview {
			flex: 2 1 auto;
			}
		.overlay-content .preview iframe{
			height: 100%;
			width: 100%;
		}
		#toast.show {
		    visibility: visible;
		    -webkit-animation: fadein 0.5s, fadeout 0.5s 2.5s;
		    animation: fadein 0.5s, fadeout 0.5s 2.5s;
		}
		
		.offer-row .offer-id a{
			cursor: hand;
			color: blue;
			text-decoration: underline;
		}
		@-webkit-keyframes fadein {
		    from {bottom: 0; opacity: 0;}
		    to {bottom: 30px; opacity: 1;}
		}
		@keyframes fadein {
		    from {bottom: 0; opacity: 0;}
		    to {bottom: 30px; opacity: 1;}
		}
		@-webkit-keyframes fadeout {
		    from {bottom: 30px; opacity: 1;}
		    to {bottom: 0; opacity: 0;}
		}
		@keyframes fadeout {
		    from {bottom: 30px; opacity: 1;}
		    to {bottom: 0; opacity: 0;}
		}
		</style>
		<link href="https://cdn.kinmarketplace.com/admin/jsoneditor.min.css" rel="stylesheet" type="text/css">
	</head>
	<body>
	
		<h1><a href="/">Marketplace Admin</a></h1>
		<div id="toast">MSG TOAST</div>
		<div class="overlay"">
			<div class="overlay-content flex-row-container">
				<div class="text" class="wide"></div>
				<div class="controls">
					<button class="preview-btn btn">Refresh Preview</button>
					<br />
					<button class="publish-btn btn">Publish</button>
					<br />
					<button class="btn" onclick="overlayOff()">Close</button>
				</div>
				<div class="preview"><iframe></iframe></div>
			</div>
		</div>
		<div id="content">${ content }</div>
		<div id="footer"></div>
	
		<script src="https://cdnjs.cloudflare.com/ajax/libs/axios/0.18.0/axios.min.js" async></script>
		<script src="https://cdn.kinmarketplace.com/admin/jsoneditor.min.js" async></script>
		
		<script>
			let overlayElement;
			let overlayTextElement;
			let toastElemnt;
			let previewElemnt;
			let previewBtnElemnt;
			let publishBtnElemnt;
			var overlayJsonEditor;
	
			document.addEventListener("DOMContentLoaded", function() {
				overlayElement = document.querySelector(".overlay");
				overlayTextElement = document.querySelector(".overlay .text");
				previewBtnElemnt = document.querySelector(".overlay .preview-btn");
				previewElemnt = document.querySelector(".overlay .preview iframe");
				publishBtnElemnt = document.querySelector(".overlay .publish-btn");
				
				toastElemnt = document.querySelector("#toast");
				previewBtnElemnt.addEventListener("click", refreshPreviewBtnHandler)
				publishBtnElemnt.addEventListener("click", publishBtnHandler)
			});
			
			
			function toast(msg) {
			    toastElemnt.innerText = msg;
			    toastElemnt.className = "show";
			    setTimeout(function(){ toastElemnt.className = toastElemnt.className.replace("show", ""); }, 3000);
			}
			function submitData(url, data) {
				axios.post(url, data)
					.then(res => toast("ok"))
					.catch(err => alert("error: " + JSON.stringify(err)));
			}
			function overlayOn(text, offerId) {
				var jsonEditorOptions = {
					mode: 'form',
					modes: ['view', 'form', 'tree', 'code']
					
				};
				overlayElement.style.display = "block";
				overlayElement.dataset.offerId = offerId;
				
				overlayJsonEditor = new JSONEditor(overlayTextElement, jsonEditorOptions, JSON.parse(unescape(text), null,  2));
				overlayJsonEditor.expandAll();
			}
			function overlayOff() {
				overlayElement.style.display = "none";
				overlayTextElement.textContent = "";
				previewElemnt.src = "";
			}
		
			function stringifyJson(json){
				// This isn't really needed because the JSON editor escapes and protects but just to be on the safe side
				try {
					jsonData = JSON.stringify(json);
					return jsonData;
				} catch {
					toast("Invaid JSON");
					return false;
				}
			}
			
			
			function publishBtnHandler(){
				const json = stringifyJson(overlayJsonEditor.get());
				if (!json){
					return;
				}
				var data = {
					content: json,
				};
				submitData("/offers/" + overlayElement.dataset.offerId, data);
			}
			
			function refreshPreviewBtnHandler (){
				refreshPreview(overlayJsonEditor.get());
			}
			function refreshPreview(json){
				let jsonData = stringifyJson(json);
				if (!jsonData){
					return;
				}
				previewElemnt.src = "${getConfig().webview}?cacheBuster=${Date.now()}&jsonData=" + encodeURIComponent(jsonData);
			}
	</script>
	</body>

</html>`;
		/* tslint:enable:no-trailing-whitespace */
		res.status(200).send(html);
	} as any as RequestHandler;
}

export async function index(params: { app_id: string }, query: any): Promise<string> {
	return `<ul>
<li><a href="/applications">/applications</a></li>
<li><a href="/offers">/offers</a></li>
<li><a href="/orders">/orders</a></li>
<li><a href="/fuzzy">/fuzzy</a></li>
</ul>`;
}

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.get("/applications", wrapService(getApplications))
		.get("/applications/:app_id", wrapService(getApplication))
		.get("/applications/:app_id/offers", wrapService(getApplicationOffers))
		.get("/applications/:app_id/offers/stats", wrapService(getOfferStats))
		.get("/applications/:app_id/users", wrapService(getApplicationUsers))
		.get("/applications/:app_id/stats", wrapService(getApplicationStats))
		.get("/offers", wrapService(getOffers))
		.get("/orders", wrapService(getOrders))
		.get("/offers/:offer_id", wrapService(getOffer))
		.get("/polls/:offer_id", wrapService(getPollResults))
		.get("/users/:user_id", wrapService(getUserData))
		.get("/users/:user_id/offers", wrapService(getUserOffers))
		.get("/applications/:app_id/users/:app_user_id", wrapService(getApplicationUserData))
		.get("/orders/:order_id", wrapService(getOrder))
		.get("/fuzzy/:some_id", wrapService(fuzzySearch))
		.get("/wallets/:wallet_address", wrapService(getWallet))
		.get("/wallets/:wallet_address/payments", wrapService(getWalletPayments))
		.get("/", wrapService(index))
		// retries
		.get("/orders/:order_id/retry", wrapService(retryOrder))
		.get("/users/:user_id/wallets/:wallet/retry", wrapService(retryUserWallet))
		// change data
		.post("/applications/:app_id/offers/:offer_id", jsonResponse(changeAppOffer))
		.post("/offers/:offer_id", jsonResponse(changeOffer))
	;

	app.use("", router);
	app.get("/status", statusHandler);
	logger().info("created routes");
}
