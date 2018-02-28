const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
//const S = require('string');
chai.use(chaiAsPromised);
const assert = chai.assert;
let controller = require('../ExchangeController');
const RootDeltaExchange = artifacts.require("./RootDeltaExchange.sol");
const RDToken = artifacts.require("./RDToken.sol");
const etherTokenAddress = "0x0000000000000000000000000000000000000000";

contract('Exchange Controller Tests', function (accounts) {
    let controllerInstance;
    let tokenInstance;
    let exchangeInstance;

    let tradedTokenInstance1;
    let tradedTokenInstance2;

    const owner = accounts[0];
    const feeReceiver = accounts[1];
    const actor1 = accounts[2];
    const actor2 = accounts[3];
    const actor3 = accounts[4];
    const scalingFactor = 1000;
    const rdxTokenDecimalPlaces = 100000000;
    const ethDecimalPlaces = 100000000;
    const initialNumTokens = 1000*rdxTokenDecimalPlaces;
    const amountGive  = 100000;
    const amountGet   = 100000;
    const tradeAmount = 10000;
    const makeFee = 0.1 * scalingFactor;
    const takeFee = 0.2 * scalingFactor;
    const makeDiscountThreshold = 2000 * rdxTokenDecimalPlaces;
    const takeDiscountThreshold = 2000 * rdxTokenDecimalPlaces;
    const maxMakeDiscount = 60 * scalingFactor;
    const maxTakeDiscount = 60 * scalingFactor;

    // runs before each test in this block
    beforeEach(async function () {
        // Deploy all of the necessary contracts
        tokenInstance = await RDToken.new();
        // Mint the official Root Delta token
        // Give the owner some tokens
        await tokenInstance.mint(owner, 200000 * rdxTokenDecimalPlaces);
        await tokenInstance.mint(actor1, 200000 * rdxTokenDecimalPlaces);
        await tokenInstance.mint(actor2, 200000 * rdxTokenDecimalPlaces);
        exchangeInstance = await RootDeltaExchange.new(feeReceiver, tokenInstance.address, makeFee, takeFee, makeDiscountThreshold,takeDiscountThreshold,maxTakeDiscount,maxMakeDiscount);
        controllerInstance = new controller.ExchangeController(null, tokenInstance, exchangeInstance, RootDeltaExchange, exchangeInstance.address, web3);
        tradedTokenInstance1 = await RDToken.new();
        await tradedTokenInstance1.mint(owner, initialNumTokens);
        await tradedTokenInstance1.mint(actor1, initialNumTokens);
        await tradedTokenInstance1.mint(actor2, initialNumTokens);
        await tradedTokenInstance1.finishMinting();
        tradedTokenInstance2 = await RDToken.new();
        await tradedTokenInstance2.mint(owner, initialNumTokens);
        await tradedTokenInstance2.mint(actor2, initialNumTokens);
        await tradedTokenInstance2.mint(actor3, initialNumTokens);
        await tradedTokenInstance2.finishMinting();
    });

    
    describe('trade functionality tests', function () {




        it('should incur the appropriate fee - with no discount', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});

                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));
                let expectedTakerFee = tradeAmount * (takeFee / (100 * scalingFactor));
                console.log("tradeAmount : " + tradeAmount);
                console.log("makeFee : " + makeFee);
                console.log("takeFee : " + takeFee);
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                //assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor2);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                console.log("feeBalanceMaker : " + feeBalanceMaker);
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - expectedMakerFee);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
               // assert.equal(actor2Token1Balance, tradeAmount - expectedTakerFee);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
               // assert.equal(actor2Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be true that no discount is applied when the maker has less the threshold of tokens', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Give the taker the threshold number of tokens
                let numTokens = makeDiscountThreshold - 1;
                await tokenInstance.transfer(actor3, numTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTokens);
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor3});

                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));
                let expectedTakerFee = tradeAmount * (takeFee / (100 * scalingFactor));

                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - expectedMakerFee);
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount - expectedTakerFee);
                let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                assert.equal(actor3Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be true that a single basis point of discount is not enough to be applied; when the taker has the threshold of tokens', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Give the taker the threshold number of tokens
                let numTokens = makeDiscountThreshold;
                await tokenInstance.transfer(actor3, numTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTokens);
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor3});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);

                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));
                let expectedTakerFee = tradeAmount * (takeFee / (100 * scalingFactor));

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - expectedMakerFee);
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount - expectedTakerFee);
                let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                assert.equal(actor3Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be true that a 50% discount of the fee is applied when the taker has enough tokens', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Change the taker fee to a larger amount so that the discount kicks in
                let newTakerFee = 5 * scalingFactor;
                await exchangeInstance.changeFeeTake(newTakerFee, {from: owner});
                // Give the taker double the threshold number of tokens
                let numTokens = makeDiscountThreshold * 50;
                await tokenInstance.transfer(actor3, numTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTokens);
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor3});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);

                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));
                let expectedTakerFee = tradeAmount * ((newTakerFee / 2) / (100 * scalingFactor));
                console.log("Expected new take fee: " + expectedTakerFee);

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - expectedMakerFee);
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount - expectedTakerFee);
                // let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                // assert.equal(actor3Token2Balance, initialNumTokens);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be true that if the max discount is 100% and the taker has the appropriate number of tokens then there is no fee', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Set the max taker discount to 100%
                await exchangeInstance.changeMaxTakeDiscount(100*scalingFactor, {from: owner});
                // Give the taker the minimum number of tokens required for the max discount
                let numTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor3, numTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTokens);
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor3});

                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));

                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);

                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                let expectedTakerFee = 0;
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - expectedMakerFee);
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount);
                let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                assert.equal(actor3Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });/*

        it('should be true that if the max discount is 100% and the taker has more than enough tokens for the discount that the taker fee still equals 0', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Set the max taker discount to 100%
                await exchangeInstance.changeMaxTakeDiscount(100*scalingFactor, {from: owner});
                // Give the taker the minimum number of tokens required for the max discount
                let numTokens = makeDiscountThreshold * 101;
                await tokenInstance.transfer(actor3, numTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTokens);
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor3});

                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                let expectedMakerFee = tradeAmount * (makeFee / (100 * scalingFactor));
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                let expectedTakerFee = 0;
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount - tradeAmount * (makeFee / (100 * scalingFactor)));
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount);
                let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                assert.equal(actor3Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be true that with enough tokens it is possible for both the maker and takers fees to equals 0', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor3});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor3});
                // Set the max taker discount to 100%
                await exchangeInstance.changeMaxTakeDiscount(100*scalingFactor, {from: owner});
                await exchangeInstance.changeMaxMakeDiscount(100*scalingFactor, {from: owner});
                // Give the taker the minimum number of tokens required for the max discount
                let numMakeTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor1, numMakeTokens, {from: owner});
                let rdTokenBalance = await tokenInstance.balanceOf(actor1);
                assert.equal(rdTokenBalance.toNumber(), numMakeTokens);
                await tokenInstance.approve(exchangeInstance.address, numMakeTokens, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, numMakeTokens, {from: actor1});
                let numTakeTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor3, numTakeTokens, {from: owner});
                rdTokenBalance = await tokenInstance.balanceOf(actor3);
                assert.equal(rdTokenBalance.toNumber(), numTakeTokens);
                await tokenInstance.approve(exchangeInstance.address, numTakeTokens, {from: actor3});
                await exchangeInstance.depositToken(tokenInstance.address, numTakeTokens, {from: actor3});

                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, tradeAmount, actor3);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                let expectedMakerFee = 0;
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                let expectedTakerFee = 0;
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - tradeAmount);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, tradeAmount);
                let actor3Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor3);
                assert.equal(actor3Token1Balance, tradeAmount);
                let actor3Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor3);
                assert.equal(actor3Token2Balance, initialNumTokens - tradeAmount);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });*/

        it('should be possible to exchange a number of tokens for ETH including the appropriate fee - with no discount', async function () {
            try {
                // Set up test
                let initialNumRDXTokensMaker = new web3.BigNumber(1000).times(rdxTokenDecimalPlaces);
                let initialNumRDXTokensTaker = new web3.BigNumber(1).times(rdxTokenDecimalPlaces);
                let numRDXTokensToExchange = new web3.BigNumber(200).times(rdxTokenDecimalPlaces);
                let amountOfEthAskedFor = web3.toWei(0.1, 'ether');

                let expectedMakeFee = web3.toWei(0.0001, 'ether');
                let expectedTakeFee = 0.4 * rdxTokenDecimalPlaces;

                // Set up initial balances
                await tokenInstance.transfer(actor1, initialNumRDXTokensMaker, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, initialNumRDXTokensMaker, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, initialNumRDXTokensMaker, {from: actor1});

                await tokenInstance.transfer(actor2, initialNumRDXTokensTaker, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, initialNumRDXTokensTaker, {from: actor2});
                await exchangeInstance.depositToken(tokenInstance.address, initialNumRDXTokensTaker, {from: actor2});
                // Deposit enough to cover the cost plus the fee.
                await exchangeInstance.deposit({from: actor2, value: amountOfEthAskedFor});

                let actor1EthBalanceBefore = await controllerInstance.getBalance(etherTokenAddress, actor1);
                assert.equal(actor1EthBalanceBefore, 0);
                let actor2EthBalanceBefore = await controllerInstance.getBalance(etherTokenAddress, actor2);
                assert.equal(actor2EthBalanceBefore, amountOfEthAskedFor);

                // Create the order
                await exchangeInstance.order(etherTokenAddress, amountOfEthAskedFor, tokenInstance.address, numRDXTokensToExchange, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(etherTokenAddress, amountOfEthAskedFor, tokenInstance.address, numRDXTokensToExchange, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(etherTokenAddress, amountOfEthAskedFor, actor1, tokenInstance.address, numRDXTokensToExchange, 9999, 0, amountOfEthAskedFor, actor2);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(etherTokenAddress,feeReceiver);
                assert.equal(feeBalanceMaker, expectedMakeFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tokenInstance.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedTakeFee);
                let actor1Token1Balance = await controllerInstance.getBalance(etherTokenAddress,actor1);
                assert.equal(actor1Token1Balance, amountOfEthAskedFor - expectedMakeFee);
                let actor1Token2Balance = await controllerInstance.getBalance(tokenInstance.address,actor1);
                assert.equal(actor1Token2Balance, initialNumRDXTokensMaker - numRDXTokensToExchange.toNumber());
                let actor2Token1Balance = await controllerInstance.getBalance(tokenInstance.address,actor2);
                assert.equal(actor2Token1Balance, initialNumRDXTokensTaker.plus(numRDXTokensToExchange).minus(expectedTakeFee).toNumber());
                let actor2Token2Balance = await controllerInstance.getBalance(etherTokenAddress,actor2);
                assert.equal(actor2Token2Balance, 0);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });
    });

});

// describe('Cancel order functionality tests', function () {
    //     it('should be possible to cancel an open order', async function () {
    //         try {
    //             // Set up test
    //             // Deposit the token in the exchange - and give the necessary permissions
    //             await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
    //             await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
    //             await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
    //             await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
    //             // Create the order
    //             await exchangeInstance.order(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 9999, 0, {from: actor1});
    //             // First verify that the state is as expected
    //             let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 9999, 0);
    //             let orderPlaced = await exchangeInstance.orders(actor1, hash);
    //             assert.isTrue(orderPlaced);
    //             // Test
    //             await controllerInstance.cancelOrder(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 9999, 0, actor1);
    //             // Verify
    //             orderFills = await exchangeInstance.orderFills(actor1, hash);
    //             assert.equal(initialNumTokens, orderFills.toNumber());
    //         } catch (e) {
    //             console.log(e);
    //             throw e;
    //         }
    //     })
    // });

