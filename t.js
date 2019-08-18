const key1 = "offer_contents:OMqStC0KfwFT3HRjXk3k2:content:pages[0].title";
const regex1 = /\b([a-zA-Z0-9_ ]+:)\w+:|\[\d\]/g;
console.log(key1.replace(regex1,"$1"));
// result: offer_contents:content:pages.title

const key2 = "offer_contents:Generic Poll #40:content:pages[0].title";
const regex2 = /\([a-zA-Z0-9_ ]+:)[\w\s\#]+:|\[\d\]\/;
console.log(key2.replace(regex2,"$1"));
// result should be: offer_contents:content:pages.title
// what is regex2 ?

console.log("offer_contents:Generic Poll #40:content:pages[2].question.answers[0]".replace(/:(.*?):/,':').replace(/\[.\]/g,''));
