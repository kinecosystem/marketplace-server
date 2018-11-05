import { KinNetwork } from "./networks";
import { create as createWallet, Keypair } from "./client";

const publicKey = "GDFID4LXSWH5Y5QRV2CB26SE4KL24QYEBSVDQFCADCD2PCDA5IDNNZFL";
const secretKey = "SBJQWLNJR2BHHMHG2ZZIVZ6D4PFCYUMRZXOBXO6TROHVD7W4XJXO5UWQ";

const keys = Keypair.fromSecret(secretKey);
const network = KinNetwork.from(
	"Kin Playground Network ; June 2018",
	"GBC3SG6NGTSZ2OMH3FFGB7UVRQWILW367U4GSOOF4TFSZONV42UJXUH7",
	"https://horizon-playground.kininfrastructure.com/");

createWallet(network, keys).then(wallet => {
	console.log(wallet);
	wallet.onPaymentReceived(console.log);
});
