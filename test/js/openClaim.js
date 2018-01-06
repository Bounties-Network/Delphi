/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('./utils.js');
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
        await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected revert if the fee is not transferred with the transaction');
    });

    it('should add a new claim to the claims array and properly initialize its properties',
      async () => {
        const ds = await DelphiStake.deployed();
        const claimAmount = '1';
        const feeAmount = '1';

        await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      // TODO: Check that claim properties are properly initialized
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
      const ds = await DelphiStake.deployed();
      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('1', 10);

      const startingStake = await ds.stake.call();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant, value: feeAmount });

      const finalStake = await ds.stake();
      assert.strictEqual(startingStake.sub(claimAmount.add(feeAmount)).toString(10),
        finalStake.toString(10),
        'stake was not decremented as-expected when a new claim was opened');

      // TODO: Check the actual ether balance as well
      // Note to Mark: we're going to have to rewrite so much to support both ETH and ERC20.....
    });

    it('should set lockup remaining to lockupEnding - now');
    it('should set lockupEnding to zero');
    it('should emit a NewClaim event');
    it('should append claims to the end of the claim array, without overwriting earlier claims');
  });
});

