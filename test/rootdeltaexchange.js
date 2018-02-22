const RootDeltaExchange = artifacts.require('./RootDeltaExchange.sol');
const RDToken = artifacts.require('./RDToken.sol');
const chai = require('chai');
const expect = chai.expect;

const scalingFactor = 1000;

contract('RootDeltaExchange', (accounts) => {
    let admin;
    let feeAccount = accounts[1];
    let rdeContract;
    let rdToken;
    const etherTokenAddress = "0x0000000000000000000000000000000000000000";


    beforeEach(async () => {
        admin = accounts[0];
        rdToken = await RDToken.deployed();
        let result = rdToken.mint(feeAccount,10000);
        rdeContract= await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
    });

    describe('check the max discount values', () => {
        it('should be possible to set the maxMakerDiscount to 100%', async () => {
            let expectedDiscount = 100 * scalingFactor;

            await rdeContract.changeMaxMakeDiscount(expectedDiscount, {from: admin});

            let maxMakeDiscount = await rdeContract.maxMakeDiscount.call();

            expect(expectedDiscount).to.equal(maxMakeDiscount.toNumber());
        });

        it('should be possible to set the maxTakerDiscount to 100%', async () => {
            let expectedDiscount = 100 * scalingFactor;

            await rdeContract.changeMaxTakeDiscount(expectedDiscount, {from: admin});

            let maxTakeDiscount = await rdeContract.maxTakeDiscount.call();

            expect(expectedDiscount).to.equal(maxTakeDiscount.toNumber());
        });

        it('should not be possible to set the maxMakerDiscount to > 100%', async () => {

            try {
                await rdeContract.changeMaxMakeDiscount(101 * scalingFactor, {from: admin});
                assert(false);
            } catch(e) {
                expect(e.message).to.include('VM Exception while processing transaction: revert');
            }
        });

        it('should not be possible to set the maxTakerDiscount to > 100%', async () => {

            try {
                await rdeContract.changeMaxTakeDiscount(101 * scalingFactor, {from: admin});
                assert(false);
            } catch(e) {
                expect(e.message).to.include('VM Exception while processing transaction: revert');
            }
        });
    });

    describe('#changeFeeAccount()', () => {
        it('changes the account that will receive fees', async () => {

            let currentStatus = await rdeContract.getStatus.call();


            await rdeContract.changeFeeAccount(feeAccount, { from: admin });
            let result = await rdeContract.feeAccount.call();

            expect(result).to.equal(feeAccount);
        });
    });

    describe('#changeFeeMake()', () => {
        describe('when the new feeMake amount is less or equal to the current feeMake amount', () => {
            it('changes the feeMake', async () => {
                //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
                let feeMake = await rdeContract.feeMake.call();
                let newFeeMake = feeMake.toNumber() - 4;

                await rdeContract.changeFeeMake(newFeeMake, { from: admin });
                let result = await rdeContract.feeMake.call();

                expect(result.toNumber()).to.equal(newFeeMake);
            });
        });
    });

    describe('#changeFeeTake()', () => {
        describe('when the new feeTake amount is greater or equal to the current feeRebate', () => {
            describe('and the new feeTake amount is less than the current feeTake amount', () => {
                it('changes the feeTake', async () => {
                    //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
                    let feeTake = await rdeContract.feeTake.call()
                    let newFeeTake = feeTake.toNumber() - 4;

                    await rdeContract.changeFeeTake(newFeeTake, { from: admin });
                    let result = await rdeContract.feeTake.call();

                    expect(result.toNumber()).to.equal(newFeeTake);
                });
            });
        });
    });

    describe('#deposit()', () => {
        it('adds the ether value to the token balance of the sender', async () => {
            //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
            let depositAmount = web3.toWei(1, 'ether');

            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });
            let etherBalance = await rdeContract.tokens.call(0, admin);

            expect(web3.fromWei(etherBalance.toNumber(), 'ether')).to.equal(web3.fromWei(depositAmount, 'ether'));
        });

        it('creates a Deposit event', async () => {
            //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
            let depositAmount = web3.toWei(1, 'ether');
            let depositEvent = rdeContract.Deposit(0, admin, depositAmount, 0);
            let result = await depositEvent.watch((err, data) => {
                if (!err) {
                    return data;
                }
            });

            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });

            expect(result).to.equal(depositEvent);
        });
    });

    describe('#balanceOf()', () => {
        it('returns the token balance of the user', async () => {
            let depositAmount = web3.toWei(1.35, 'ether');
            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });
            let balance = await rdeContract.balanceOf.call(etherTokenAddress,admin);
            let result = balance.valueOf();
            expect(result).to.equal(depositAmount);

        });
    });


    describe('when the withdrawal amount is less or equal to the current token balance of the sender', () => {
        it('withdraws the value', async () => {
            //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
            let depositAmount = web3.toWei(1, 'ether');
            let withdrawalAmount = web3.toWei(0.5, 'ether');

            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });

            await rdeContract.withdraw.sendTransaction(
                withdrawalAmount,
                { from: admin }
            );

            let etherBalance = await rdeContract.tokens.call(0, admin);
            let result = web3.fromWei(etherBalance.toNumber(), 'ether');
            let remainingBalance = web3.fromWei(depositAmount - withdrawalAmount, 'ether');

            expect(result).to.equal(remainingBalance);
        });

        it('creates a Withdraw event', async () => {
            //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
            let depositAmount = web3.toWei(1, 'ether');
            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });

            let withdrawalAmount = web3.toWei(0.5, 'ether');
            let withdrawalEvent = rdeContract.Withdraw(0, admin, withdrawalAmount, depositAmount);

            let result = await withdrawalEvent.watch((err, data) => {
                if (!err) {
                    return data;
                }
            });

            await rdeContract.withdraw.sendTransaction(
                withdrawalAmount,
                { from: admin }
            );

            expect(result).to.equal(withdrawalEvent);
        });
    });

    describe('when the withdrawal amount is greater than the current token balance of the sender', () => {
        it('throws an error', async () => {
            //let rdeContract = await RootDeltaExchange.new(feeAccount,RDToken.address,6,6,10,10,2,2);
            let depositAmount = web3.toWei(1, 'ether');
            let withdrawalAmount = web3.toWei(0.5, 'ether');

            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });

            try {
                await rdeContract.withdraw.sendTransaction(
                    withdrawalAmount,
                    { from: admin }
                );
                expect(false);

            } catch (err) {
                expect(err);
            }
        });
    });



    describe('#order()', () => {
        xit('places an order', () => {
        });
    });

    describe('#trade()', () => {
        xit('places a trade', () => {
        });
    });


});