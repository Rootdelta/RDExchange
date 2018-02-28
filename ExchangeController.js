exports.ExchangeController = class {

    constructor(config, tokenInstance, exchangeInstance, exchangeContract, exchangeAddress, web3) {
        this.SignerProvider = require('ethjs-provider-signer');
        //this.logger = require('logger').ceateLogger();
        this.sign = require('ethjs-signer').sign;
        this.Eth = require('ethjs-query');
        this.tokenInstance = tokenInstance;
        this.exchangeInstance = exchangeInstance;
        this.web3 = web3;
        this.tokenAddress = tokenInstance.address;
        this.exchangeAddress = exchangeAddress;
        this.exchangecontract = exchangeContract;
    }

    async getBalance(token,account){
        var balance = await this.exchangeInstance.balanceOf.call(token,account,{from : account});
        return balance.toNumber();
    }

    async depositToken(amount,account) {
        // tokens must have been approved first

        try {
            account = determineAccountToUse(account);
            var allow = await this.tokenInstance.allowance(account, this.exchangeAddress);
            var tx = await this.exchangeInstance.depositToken(this.tokenAddress,amount,{from : account});

        }
        catch (error) {
            // logger.error(error);
            console.error(error);
        }
    }

    async cancelOrder (tokenWantedAddress, tokenWantedAmount, tokenOfferedAddress, tokenOfferedAmount, expires, nonce, account) {
        account = determineAccountToUse(account);
        return this.exchangeInstance.cancelOrder(tokenWantedAddress, tokenWantedAmount, tokenOfferedAddress, tokenOfferedAmount, expires, nonce, 0, this.web3.fromAscii(""), this.web3.fromAscii(""), {from: account});
    }

    async withdrawToken(amount,account) {

        try {
            account = determineAccountToUse(account);
            var tx = await this.exchangeInstance.withdrawToken(this.tokenAddress, amount, {from: account});
            var newBalance = await this.exchangeInstance.balanceOf(this.tokenAddress, account);
            console.log(newBalance);
        }
        catch (error) {
            // logger.error(error);
            console.error(error);
        }
    }

    async trade(tokenWantedAddress, tokenWantedAmount, tokenWantedOwnerAddress, tokenOfferedAddress, tokenOfferedAmount, expires, nonce, amount, account) {
        account = determineAccountToUse(account);
        return this.exchangeInstance.trade(tokenWantedAddress, tokenWantedAmount, tokenOfferedAddress, tokenOfferedAmount, expires, nonce, tokenWantedOwnerAddress, 0, this.web3.fromAscii(" "), this.web3.fromAscii(" "), amount, {from: account});
    }

    getNonce(web3, account) {
        return web3.eth.getTransactionCount(account);
    }


    async signAndSendTransaction(txData, privateKey) {

        this.sendTx(txData, privateKey);

    }

    async sendTx(rawTXData, pk, callback) {
        try {
            const provider = new this.SignerProvider(this.web3.currentProvider.host, {
                signTransaction: (rawTx, cb) => cb(null, this.sign(rawTx, pk)),
            });

            const eth = new this.Eth(provider);
            await eth.sendTransaction(rawTXData, this.TxCallback);
        }
        catch (error) {
            // logger.error(error);
            console.error(error);
        }
    }

    TxCallback(error, result) {
        // logger.error(error);
        console.error(error);
        // logger.info(result);
        console.log(result);
    }

    async createTestAllowance(amount, account){

        try{
            determineAccountToUse(account);
            var allow = await this.tokenInstance.approve(this.exchangeAddress,amount, {from : account});

        }
        catch(error){
            // logger.error(error);
            console.error(error);
        }

    }

}

/*
 * If an account has not been passed in as a parameter then fall back to getting the account from the web3 provider e.g. MetaMask.
 */
function determineAccountToUse(account) {
    if (account === undefined || account === null) {
        return this.web3.eth.accounts[0];
    }
    return account;
}

