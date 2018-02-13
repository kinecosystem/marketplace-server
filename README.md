# Kin ecosystem Marketplace server
![](https://travis-ci.org/kinfoundation/marketplace-server.svg?branch=master)

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
