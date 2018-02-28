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
    let levelsInstance;
    let exchangeInstance;

    let tradedTokenInstance1;
    let tradedTokenInstance2;

    const owner = accounts[0];
    const feeReceiver = accounts[1];
    const actor1 = accounts[2];
    const actor2 = accounts[3];
    const initialNumTokens  = 10000000;
    const amountGive        = 10000;
    const amountGet         = 10000;
    const amountGetLarge    = 50000;
    const scalingFactor = 1000;
    const makeFee = 0.1 * scalingFactor;
    const takeFee = 0.2 * scalingFactor;
    const makeDiscountThreshold = 1;
    const takeDiscountThreshold = 1;
    const maxMakeDiscount = 100 * scalingFactor;
    const maxTakeDiscount = 100 * scalingFactor;

    // runs before each test in this block
    beforeEach(async function () {
        // Deploy all of the necessary contracts
        tokenInstance = await RDToken.new();
        // Mint the official Root Delta token
        // Give the owner some tokens
        await tokenInstance.mint(owner, 1000);
        await tokenInstance.finishMinting();
        //     levelsInstance = await AccountLevels.new();
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
        await tradedTokenInstance2.finishMinting();
    });

    describe('partial trade functionality tests', function () {
        it('should be possible for a take order with a larger amount than is available to match a make order', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Give the maker and taker enough tokens to have no fees to make the verification easier
                let numTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor1, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor1});
                await tokenInstance.transfer(actor2, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor2});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor2});

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                let largerAmount = amountGet + 1;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, largerAmount, actor2);
                //  now check the fee
                let expectedFee = 0;
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - amountGive);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, amountGet);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
                assert.equal(actor2Token1Balance, amountGet);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
                assert.equal(actor2Token2Balance, initialNumTokens - amountGive);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be possible for multiple take orders adding up to an amount that is larger than the make order to be filled (one partially)', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Give the maker and taker enough tokens to have no fees to make the verification easier
                let numTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor1, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor1});
                await tokenInstance.transfer(actor2, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor2});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor2});

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGet, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                let smallerAmount = amountGet / 10;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, smallerAmount, actor2);
                smallerAmount = amountGet / 5;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, smallerAmount, actor2);
                smallerAmount = amountGet;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGet, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, smallerAmount, actor2);
                //  now check the fee
                let expectedFee = 0;
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - amountGive);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, amountGet);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
                assert.equal(actor2Token1Balance, amountGet);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
                assert.equal(actor2Token2Balance, initialNumTokens - amountGive);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be possible for a non-parity take order with a larger amount than is available to match a make order', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Give the maker and taker enough tokens to have no fees to make the verification easier
                let numTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor1, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor1});
                await tokenInstance.transfer(actor2, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor2});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor2});

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                let largerAmount = amountGetLarge + 1;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGetLarge, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, largerAmount, actor2);
                //  now check the fee
                let expectedFee = 0;
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - amountGive);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, amountGetLarge);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
                assert.equal(actor2Token1Balance, amountGive);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
                assert.equal(actor2Token2Balance, initialNumTokens - amountGetLarge);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        it('should be possible for a non-parity take order with a vastly larger amount than is available to match a make order', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Give the maker and taker enough tokens to have no fees to make the verification easier
                let numTokens = makeDiscountThreshold * 100;
                await tokenInstance.transfer(actor1, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor1});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor1});
                await tokenInstance.transfer(actor2, numTokens, {from: owner});
                await tokenInstance.approve(exchangeInstance.address, numTokens, {from: actor2});
                await exchangeInstance.depositToken(tokenInstance.address, numTokens, {from: actor2});

                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                let largerAmount = amountGetLarge * 10;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGetLarge, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, largerAmount, actor2);
                //  now check the fee
                let expectedFee = 0;
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(feeBalanceMaker, expectedFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                assert.equal(feeBalanceTaker, expectedFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - amountGive);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, amountGetLarge);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
                assert.equal(actor2Token1Balance, amountGive);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
                assert.equal(actor2Token2Balance, initialNumTokens - amountGetLarge);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });

        xit('should be possible for a non-parity take order with a vastly larger amount than is available to match a make order and the fees should be correct', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // check fee balance is zero
                let balance = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                assert.equal(balance,0);
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, amountGetLarge, tradedTokenInstance1.address, amountGive, 9999, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                let largerAmount = amountGetLarge * 10;
                await controllerInstance.trade(tradedTokenInstance2.address, amountGetLarge, actor1, tradedTokenInstance1.address, amountGive, 9999, 0, largerAmount, actor2);
                //  now check the fee
                let feeBalanceMaker = await controllerInstance.getBalance(tradedTokenInstance2.address,feeReceiver);
                let expectedMakerFee = amountGetLarge * (makeFee / (100 * scalingFactor));
                assert.equal(feeBalanceMaker, expectedMakerFee);
                let feeBalanceTaker = await controllerInstance.getBalance(tradedTokenInstance1.address,feeReceiver);
                let expectedTakerFee = amountGive * (takeFee / (100 * scalingFactor));
                assert.equal(feeBalanceTaker, expectedTakerFee);
                let actor1Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor1);
                assert.equal(actor1Token1Balance, initialNumTokens - amountGive);
                let actor1Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor1);
                assert.equal(actor1Token2Balance, amountGetLarge - expectedMakerFee);
                let actor2Token1Balance = await controllerInstance.getBalance(tradedTokenInstance1.address,actor2);
                assert.equal(actor2Token1Balance, amountGive);
                let actor2Token2Balance = await controllerInstance.getBalance(tradedTokenInstance2.address,actor2);
                assert.equal(actor2Token2Balance, initialNumTokens - amountGetLarge - expectedTakerFee);
            } catch (e) {
                console.log(e);
                throw e;
            }
        });
    })

});