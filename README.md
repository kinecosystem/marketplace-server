# Kin ecosystem Marketplace server
![](https://travis-ci.org/kinfoundation/marketplace-server.svg?branch=master)

## Disclaimer
Any data that appears in the repo does not reflect real partnerships or product integrations. We use real company names and products for the sole sake of mocking data to populate our SDK client.

### Install/Run
Clone this repo, and then in a terminal:
```bash
marketplace-server> npm i
marketplace-server> npm run restart
```

### Development
Please make sure that you follow the code conventions which are described/enforced by the IDE and tslint.  
In any jetbrains based IDE (webstorm, pycharm, intellij, etc):

 - Code style 
   1. Go to the Preferences > Editor > Code Style  
   2. Click the small gears icon besides the Scheme drop down box
   3. Import Scheme > IntelliJ IDEA code style XML  
   4. Select the [code_style_scheme.xml](code_style_scheme.xml) file in the root of this project.

 - TSLint
   1. Go to Preferences > Languages & Frameworks > TypeScript > TSLint
   2. Check the **Enable** box
   3. Make sure that the **Search for tslint.json** options is selected under **Configuration file**.


### Testing

In order to setup local testing, first we need to create the DB:
```
make db
```

now we will edit the DB (sqlite3 is a prerequisite) and set an initial value manually, so run:
```
sqlite3 database.sqlite
```

now, run the following command in the sqlite REPL:
```
update orders set amount=1;
```

insert mock data into the DB:
```
node scripts/bin/create
```

make sure that the files are compiled:
```
marketplace-server> npm run build
```

Or, if you want to avoid the *clean* and *lint* part:
```
marketplace-server> npm run transpile
```

After the scripts are compiled, run the tests:
```
marketplace-server> npm test
```

### To run docker tests:

you need to have a stellar account with funds and create a `.env` file locally with the following content:
```
STELLAR_CHANNEL_SEEDS=SXXX
STELLAR_BASE_SEED=SXXX
STELLAR_ADDRESS=GXXX
```

Then run the following commands:
```
make build  # build typescript
make up  # start all services
make test-system-docker  # run tests
```
