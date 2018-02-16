const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
//const S = require('string');
chai.use(chaiAsPromised);
const assert = chai.assert;
let controller = require('../app/javascripts/ExchangeController');
const RootDeltaExchange = artifacts.require("./RootDeltaExchange.sol");
const RDToken = artifacts.require("./RDToken.sol");
const AccountLevels = artifacts.require("./AccountLevels.sol");
const MintableToken = artifacts.require("./MintableToken.sol");

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
    const initialNumTokens = 100;

    // runs before each test in this block
    beforeEach(async function () {
        // Deploy all of the necessary contracts
        tokenInstance = await RDToken.new();
        levelsInstance = await AccountLevels.new();
        exchangeInstance = await RootDeltaExchange.new(feeReceiver.address, levelsInstance.address, new web3.BigNumber(10), new web3.BigNumber(10), new web3.BigNumber(10));
        controllerInstance = new controller.ExchangeController(null, tokenInstance, exchangeInstance, RootDeltaExchange, exchangeInstance.address, web3);
        tradedTokenInstance1 = await MintableToken.new();
        await tradedTokenInstance1.mint(owner, initialNumTokens);
        await tradedTokenInstance1.mint(actor1, initialNumTokens);
        await tradedTokenInstance1.mint(actor2, initialNumTokens);
        await tradedTokenInstance1.finishMinting();
        tradedTokenInstance2 = await MintableToken.new();
        await tradedTokenInstance2.mint(owner, initialNumTokens);
        await tradedTokenInstance2.mint(actor2, initialNumTokens);
        await tradedTokenInstance2.finishMinting();
    });

    describe('Cancel order functionality tests', function () {
        it('should be possible to cancel an open order', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 100, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 100, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.cancelOrder(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 100, 0, actor1);
                // Verify
                orderFills = await exchangeInstance.orderFills(actor1, hash);
                assert.equal(initialNumTokens, orderFills.toNumber());
            } catch (e) {
                console.log(e);
                throw e;
            }
        })
    });


    describe('trade functionality tests', function () {
        it('should be possible to trade an appropriate open order', async function () {
            try {
                // Set up test
                // Deposit the token in the exchange - and give the necessary permissions
                await tradedTokenInstance1.approve(exchangeInstance.address, initialNumTokens, {from: actor1});
                await exchangeInstance.depositToken(tradedTokenInstance1.address, initialNumTokens, {from: actor1});
                await tradedTokenInstance2.approve(exchangeInstance.address, initialNumTokens, {from: actor2});
                await exchangeInstance.depositToken(tradedTokenInstance2.address, initialNumTokens, {from: actor2});
                // Create the order
                await exchangeInstance.order(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 200, 0, {from: actor1});
                // First verify that the state is as expected
                let hash = await exchangeInstance.verifyHash(tradedTokenInstance2.address, initialNumTokens, tradedTokenInstance1.address, initialNumTokens, 200, 0);
                let orderPlaced = await exchangeInstance.orders(actor1, hash);
                assert.isTrue(orderPlaced);
                // Test
                await controllerInstance.trade(tradedTokenInstance2.address, initialNumTokens, actor1, tradedTokenInstance1.address, initialNumTokens, 200, 0, initialNumTokens, actor2);
                // Verify
                orderFills = await exchangeInstance.orderFills(actor1, hash);
                assert.equal(initialNumTokens, orderFills.toNumber());
            } catch (e) {
                console.log(e);
                throw e;
            }
        })
    })
});