const RootDeltaExchange = artifacts.require('./RootDeltaExchange.sol');
const chai = require('chai');
const expect = chai.expect;

contract('RootDeltaExchange', (accounts) => {
    let admin;

    beforeEach(async () => {
        admin = accounts[0];
    });

    describe('#changeFeeAccount()', () => {
        it('changes the account that will receive fees', async () => {
            let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10);
            let currentStatus = await rdeContract.getStatus.call();
            let feeAccount = accounts[1];

            await rdeContract.changeFeeAccount(feeAccount, { from: admin });
            let result = await rdeContract.feeAccount.call();

            expect(result).to.equal(feeAccount);
        });
    });

    describe('#changeFeeMake()', () => {
        describe('when the new feeMake amount is less or equal to the current feeMake amount', () => {
            it('changes the feeMake', async () => {
                let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
                let feeMake = await rdeContract.feeMake.call();
                let newFeeMake = feeMake.toNumber() - 5;

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
                    let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
                    let feeTake = await rdeContract.feeTake.call()
                    let newFeeTake = feeTake.toNumber() - 5;

                    await rdeContract.changeFeeTake(newFeeTake, { from: admin });
                    let result = await rdeContract.feeTake.call();

                    expect(result.toNumber()).to.equal(newFeeTake);
                });
            });
        });
    });

    describe('#deposit()', () => {
        it('adds the ether value to the token balance of the sender', async () => {
            let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
            let depositAmount = web3.toWei(1, 'ether');

            await rdeContract.deposit.sendTransaction({
                from: admin,
                value: depositAmount
            });
            let etherBalance = await rdeContract.tokens.call(0, admin);

            expect(web3.fromWei(etherBalance.toNumber(), 'ether')).to.equal(web3.fromWei(depositAmount, 'ether'));
        });

        it('creates a Deposit event', async () => {
            let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
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

    describe('#withdraw()', () => {
        describe('when the withdrawal amount is less or equal to the current token balance of the sender', () => {
            it('withdraws the value', async () => {
                let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
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
                let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
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
                let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
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
    });

    describe('#depositToken()', () => {
        describe('when the token is not ether', () => {
            beforeEach(async () => {
                let depositAmount = 1;
                let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
            });

            describe('when transfer is approved', () => {
                beforeEach(async () => {
                    let altToken = 1;
                    // mock ERC20(_token).transferFrom(msg.sender, this, _amount) => return true
                });

                xit('adds the ether value to the token balance of the sender', async () => {
                    await rdeContract.depositToken.sendTransaction(
                        altToken,
                        depositAmount,
                        {
                            from: admin
                        }
                    );
                    let altTokenBalance = await rdeContract.tokens.call(altToken, admin);
                    let result = altTokenBalance.toNumber();

                    expect(result).to.equal(depositAmount);
                });

                xit('creates a Deposit event', async () => {
                    let rdeContract = await RootDeltaExchange.new("0x627306090abab3a6e1400e9345bc60c78a8bef57","0xf17f52151ebef6c7334fad080c5704d77216b732",10,10,10,10,1,1);
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

            describe('when the transfer is not approved', () => {
                it('reverts', () => {
                    // mock ERC20(_token).transferFrom(msg.sender, this, _amount) => return false
                });
            });
        });

        describe('when it is an Ether token', () => {
            it('throws an error', () => {

            });
        });
    });

    describe('#withdrawToken()', () => {
        xit('withdraws tokens', () => {
        });
    });

    describe('#balanceOf()', () => {
        xit('returns the token balance of the user', () => {
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

    describe('#tradeBalances()', () => {
        xit('deposits tokens', () => {
        });
    });

    describe('#testTrade()', () => {
        xit('tests a trade', () => {
        });
    });

    describe('#availableVolume()', () => {
        xit('returns the available volume', () => {
        });
    });

    describe('#amountFilled()', () => {
        xit('returns the amount that got filled', () => {
        });
    });

    describe('#cancelOrder()', () => {
        xit('cancels an order', () => {
        });
    });

    describe('#getStatus()', () => {
    });

    describe('#userAddress()', () => {
    });

    describe('#verifyHash()', () => {
    });
});