const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const assert = require('assert');
const fetch = require('node-fetch');

const dbUrl = process.env.MONGODB_URI || 'mongodb://mingyue:Secure1@ds018498.mlab.com:18498/stockdb';
const dbName = 'stockdb';
const collName = 'stockUsers';
const saltRounds = 15;

const app = express();

MongoClient.connect(dbUrl, (err, client) => {
	if(err) console.log(err);

	db = client.db(dbName);
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.urlencoded({extended: true}));

app.use(bodyParser.json());


app.get('/', (req, res) => {
	res.send('Express is running!');
});


app.post('/login', (req, res) => {  //handles login post requests
	let user = req.body.username;
	let passText = req.body.password;
	let searchObj = {};
	searchObj["username"] = user;
	db.collection(collName).find(searchObj).toArray((err, result) => {
		if(err) return err;

		if(result.length == 0){
			res.send({"login": false});
		}
		else{
			let hash = result[0].password;

			bcrypt.compare(passText, hash).then(passBool => {
				if(passBool){
					res.send({"login": true, "stockList": result[0].stockList, "accountCash": result[0].accountCash});
				}
				else{
					res.send({"login": false});
				}
			});
		}
	});
});


app.post('/signup', (req, res) => {  //handles signup post requests
	let user = req.body.username;
	let passText = req.body.password;
	let uObj = {};
	uObj["username"] = user;

	db.collection(collName).find(uObj).toArray((err, result) => {
		if(err) return err;

		if(result.length > 0){  //checks if username is already taken
			res.send({'openName': false}); 
		}
		else{
			bcrypt.genSalt(saltRounds, (err, salt) => {
				bcrypt.hash(passText, salt, (err, hash) =>{
					uObj["password"] = hash;
					uObj["stockList"] = req.body.stockList;
					uObj["accountCash"] = req.body.accountCash;

					db.collection(collName).insertOne(uObj, (err, r) => {
						if(err) return err;
						assert.equal(1, r.insertedCount);
						res.send({'openName': true});
					});
				});
			});
		}
	});
});


app.post('/update', (req, res) => {
	let symbol = req.body.symbol;
	let timespan = req.body.timespan;
	let fetchUrl = "https://api.iextrading.com/1.0/stock/" + symbol + "/chart/" + timespan;

	fetch(fetchUrl)
	.catch(err => console.log(err))
	.then(response  => {
		if(response.status > 399 && response.status < 500){
			let errorObj = {"searchErr": true};
			return errorObj;
		}
		else{
			return response.json();
		}
	})
	.then(dataArr => {
		if(Array.isArray(dataArr)){
			let lowest = dataArr[0].low;
			let highest = dataArr[0].high;
			let currMonth = dataArr[0]["label"].slice(0, 3);

			let newDataArr = dataArr.map((dataObj, ind) => {
				let newLabel = dataObj["label"];
				if (currMonth == newLabel.slice(0,3) && ind != 0){
					newLabel = newLabel.split(/\W/)[1];
				}
				else{
					currMonth = newLabel.slice(0,3);
				}

				let newObj = {
					"open": dataObj.open,
					"high": dataObj.high,
					"low": dataObj.low,
					"close":dataObj.close,
					"change":dataObj.changePercent,
					"label": newLabel
				};
				if(dataObj.low < lowest && dataObj.low > 0){
					lowest = dataObj.low;
				}
				else if(lowest < 0 && dataObj.low > 0){
					lowest  = dataObj.low;
				}
				if(dataObj.high > highest && dataObj.high > 0){
					highest = dataObj.high;
				}
				return newObj;
			});

			newDataArr.filter(dataObj => dataObj.low > 0);
			return [[lowest - 1, highest + 1], newDataArr];
		}
		else{
			return dataArr;
		}
	})
	.then(newDataArr => {
		res.send(newDataArr)
	});
});

app.post('/trade', (req, res) => {
	let updateFilter = {};
	updateFilter["username"] = req.body.username;
	let setObj = {};
	setObj["stockList"] = req.body.updateObj;
	setObj["accountCash"] = req.body.accountCash;

	db.collection(collName).updateOne(updateFilter, {$set: setObj}, (err, r) => {
		assert.equal(null, err);
		assert.equal(1, r.matchedCount);
		assert.equal(1, r.modifiedCount);
	});
});

app.listen(process.env.PORT || 5005, () =>
	console.log('app is listening on port 5005')
);