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

First compile the source:
```
make build
```
then create the DB:
```
make db
```
Then run the tests:
```
make test
```

### To system tests using docker:

#### Setup
If you *DON'T* have a wallet with XLM and KIN:
Run the following command to generate a `secrets/.secrets` file with a pre-funded wallet:
```
make generate-funding-address
```
Note that this command will overwrite any existing file `secrets/.secrets`.

If you have a wallet with XLM and KIN:
You need to have a stellar account with funds and create a `secrets/.secrets` file locally with the following content:
```
export STELLAR_CHANNEL_SEEDS=SXXX
export STELLAR_BASE_SEED=SXXX
export STELLAR_ADDRESS=GXXX
```

#### Run docker servers and system tests
Run the following commands:
```
make build  # build typescript
make up  # start all services
```

And in a separate shell:
```
make test-system-docker  # run tests 
```
