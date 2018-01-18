/* eslint-env mocha */
/* global contract artifacts assert web3 */

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: openClaim', () => {
    const [staker, claimant, arbiter] = accounts;

    it('should not allow the arbiter to open a claim', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      const startingClaims = await ds.openClaims.call();

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: arbiter, value: feeAmount });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'Expected claim by arbiter to fail');
    });

    it('should not allow the staker to open a claim', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      const startingClaims = await ds.openClaims.call();

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: staker, value: feeAmount });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim by staker to fail');
    });

    it('should revert if _amount + _fee is greater than the available stake', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = conf.initialStake;
      const feeAmount = '1';

      const startingClaims = await ds.openClaims.call();

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim for more than is available in stake to fail');
    });

    it('should revert if the fee is not transferred with the transaction', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      const startingClaims = await ds.openClaims.call();

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: '0' });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected revert if the fee is not transferred with the transaction');
    });

    it('should increment the getNumClaims counter', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      const startingClaims = await ds.getNumClaims();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const finalClaims = await ds.getNumClaims();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should add a new claim to the claims array and properly initialize its properties',
      async () => {
        const ds = await DelphiStake.deployed();
        const claimAmount = '1';
        const feeAmount = '1';

        const claimId = await ds.getNumClaims();

        await ds.openClaim(claimAmount, feeAmount, 'newclaim', { from: claimant, value: feeAmount });

        const claim = await ds.claims.call(claimId);

        assert.strictEqual(claim[0], claimant, 'initialized claimant incorrectly');

        assert.strictEqual(claim[1].toString(10), claimAmount, 'initialized claim amount incorrectly');

        assert.strictEqual(claim[2].toString(10), feeAmount, 'initialized claim fee incorrectly');

        assert.strictEqual(claim[3].toString(10), '0', 'initialized claim surplus fee incorrectly');

        assert.strictEqual(claim[4], 'newclaim', 'initialized claim data incorrectly');

        assert.strictEqual(claim[5].toString(10), '0', 'initialized claim ruling incorrectly');

        assert.strictEqual(claim[6], false, 'initialized ruled bool incorrectly');

        assert.strictEqual(claim[7], false, 'initialized paid bool incorrectly');

        assert.strictEqual(claim[8], false, 'initialized settlementFailed incorrectly');
      });

    it('should increment the openClaims.call counter', async () => {
      const ds = await DelphiStake.deployed();
      const claimAmount = '1';
      const feeAmount = '1';

      const startingClaims = await ds.openClaims.call();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const finalClaims = await ds.openClaims.call();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should decrement the stakers stake by amount + fee', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);

      const startingStake = await ds.stake.call();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const finalStake = await ds.stake();
      assert.strictEqual(startingStake.sub(claimAmount.add(feeAmount)).toString(10),
        finalStake.toString(10),
        'stake was not decremented as-expected when a new claim was opened');

      const newBalance = await web3.eth.getBalance(ds.address);
      assert.strictEqual(startingStake.add(feeAmount).toString(10), newBalance.toString(10),
        'balance does not reflect the originally deposited funds and additional fee');
    });

    it('should not set lockup remaining to lockupEnding - now if no withdrawal was initiated', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);

      const lockupPeriodog = await ds.lockupPeriod.call();
      const lockupRemainingog = await ds.lockupRemaining.call();
      const lockupEndingog = await ds.lockupEnding.call();
      const withdrawInitiated = await ds.withdrawInitiated.call();

      assert.strictEqual(lockupPeriodog.toString(10), conf.lockupPeriod.toString(10),
        'lockup period not initialized properly');
      assert.strictEqual(lockupRemainingog.toString(10), conf.lockupPeriod.toString(10),
        'lockup remaining not initialized properly');
      assert.strictEqual(lockupEndingog.toString(10), '0',
        'lockup ending not initialized properly');
      assert.strictEqual(withdrawInitiated, false,
        'contract falsely believes a withdrawal has been initiated');

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const lockupPeriod = await ds.lockupPeriod.call();
      const lockupEnding = await ds.lockupEnding.call();
      const lockupRemaining = await ds.lockupRemaining.call();

      assert.strictEqual(lockupPeriod.toString(10), conf.lockupPeriod.toString(10),
        'lockup period not correct after claim is initiated (before withdrawal was initiated)');
      assert.strictEqual(lockupRemaining.toString(10), conf.lockupPeriod.toString(10),
        'lockup remaining not correct after claim is initiated (before withdrawal was initiated)');
      assert.strictEqual(lockupEnding.toString(10), '0',
        'lockup ending not correct after claim is initiated (before withdrawal was initiated)');
    });

    it('should set lockup remaining to lockupEnding - now if withdrawal was initiated', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);

      const block = await web3.eth.getBlock('latest');
      const timestamp = block.timestamp;

      await ds.initiateWithdrawStake({ from: staker });

      const lockupEnding = await ds.lockupEnding.call();

      assert.strictEqual(parseInt(lockupEnding.sub(timestamp), 10), parseInt(conf.lockupPeriod, 10),
       'lockup ending not correct after withdrawal initiated');

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const newBlock = await web3.eth.getBlock('latest');
      const newTimestamp = newBlock.timestamp;
      const newLockupRemaining = await ds.lockupRemaining.call();

      assert.strictEqual(parseInt(lockupEnding.sub(newTimestamp), 10), parseInt(newLockupRemaining, 10),
        'lockup remaining not correctly paused after claim opened');
    });

    it('should set lockupEnding to zero if withdrawal was initiated', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);


      await ds.initiateWithdrawStake({ from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const lockupEnding = await ds.lockupEnding.call();

      assert.strictEqual(lockupEnding.toString(10), '0',
        'lockup ending not correctly paused after claim opened');
    });

    it('should emit a NewClaim event');
    // TODO: add events

    it('should append claims to the end of the claim array, without overwriting earlier claims', async () => {
      const ds = await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
        conf.lockupPeriod, arbiter, { from: staker, value: conf.initialStake });
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);


      await ds.initiateWithdrawStake({ from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const lockupEnding = await ds.lockupEnding.call();

      assert.strictEqual(lockupEnding.toString(10), '0',
        'lockup ending not correctly paused after claim opened');
    });
  });
});
